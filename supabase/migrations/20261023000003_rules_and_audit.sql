-- C'Art People OS — regras de integridade, fluxos de aprovação e auditoria

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','units','departments','positions','employees',
                           'employee_sensitive','leave_requests','dp_events']
  loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Escopo derivado do colaborador: organization_id/unit_id nunca vêm do cliente
-- nas tabelas filhas, evitando gravar um registro numa unidade diferente da
-- do colaborador para contornar a RLS.
-- ---------------------------------------------------------------------------
create or replace function private.scope_from_employee()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_unit uuid;
begin
  select e.organization_id, e.unit_id into v_org, v_unit
  from public.employees e where e.id = new.employee_id;
  if v_org is null then
    raise exception 'Colaborador não encontrado' using errcode = 'foreign_key_violation';
  end if;
  new.organization_id := v_org;
  new.unit_id := v_unit;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['employee_sensitive','dependents','leave_requests','dp_events',
                           'time_entries','employee_documents']
  loop
    execute format('create trigger %I before insert or update of employee_id on public.%I
                    for each row execute function private.scope_from_employee()', t || '_scope', t);
  end loop;
end $$;

-- Quando o colaborador muda de unidade, os dados filhos acompanham.
create or replace function private.propagate_employee_unit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    update public.employee_sensitive set unit_id = new.unit_id where employee_id = new.id;
    update public.dependents         set unit_id = new.unit_id where employee_id = new.id;
    update public.employee_documents set unit_id = new.unit_id where employee_id = new.id;
    -- Histórico (ausências, DP, ponto) permanece na unidade onde ocorreu.
  end if;
  return new;
end;
$$;
create trigger employees_propagate_unit after update of unit_id on public.employees
  for each row execute function private.propagate_employee_unit();

-- Departamento e gestor precisam ser da mesma organização; sem ciclos de gestão.
create or replace function private.validate_employee()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_cycle boolean;
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d
    where d.id = new.department_id and d.organization_id = new.organization_id
  ) then
    raise exception 'Departamento não pertence à organização';
  end if;

  if not exists (select 1 from public.units u
                 where u.id = new.unit_id and u.organization_id = new.organization_id) then
    raise exception 'Unidade não pertence à organização';
  end if;

  if new.manager_id is not null then
    if not exists (select 1 from public.employees m
                   where m.id = new.manager_id and m.organization_id = new.organization_id) then
      raise exception 'Gestor não pertence à organização';
    end if;
    with recursive chain(id, depth) as (
      select new.manager_id, 0
      union all
      select e.manager_id, c.depth + 1
      from chain c join public.employees e on e.id = c.id
      where e.manager_id is not null and c.depth < 50
    )
    select exists (select 1 from chain where id = new.id) into v_cycle;
    if v_cycle then
      raise exception 'Ciclo de gestão: o colaborador não pode ser gestor de quem o gerencia';
    end if;
  end if;

  if new.status = 'terminated' and new.termination_date is null then
    raise exception 'Informe a data de desligamento';
  end if;
  return new;
end;
$$;
create trigger employees_validate before insert or update on public.employees
  for each row execute function private.validate_employee();

-- ---------------------------------------------------------------------------
-- Fluxo de férias e ausências
-- ---------------------------------------------------------------------------
create or replace function private.leave_request_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_privileged boolean;
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.requested_by := coalesce(v_uid, new.requested_by);
    new.decided_by := null;
    new.decided_at := null;
  else
    -- Usuário de sistema (service role, sem auth.uid) não passa pelas regras de fluxo.
    if v_uid is null then
      return new;
    end if;

    v_privileged := private.can_manage_people(old.organization_id, old.unit_id)
                    or private.is_manager_of(old.employee_id);

    if new.status is distinct from old.status then
      if new.status in ('approved','rejected') then
        if old.status <> 'pending' then
          raise exception 'Solicitação já foi decidida';
        end if;
        if not v_privileged then
          raise exception 'Somente o gestor, RH ou DP pode decidir esta solicitação'
            using errcode = 'insufficient_privilege';
        end if;
        if private.is_self(old.employee_id) then
          raise exception 'Não é permitido decidir a própria solicitação'
            using errcode = 'insufficient_privilege';
        end if;
        new.decided_by := v_uid;
        new.decided_at := now();
      elsif new.status = 'cancelled' then
        if old.status = 'pending' then
          null; -- titular ou responsáveis podem cancelar enquanto pendente
        elsif old.status = 'approved' and v_privileged and not private.is_self(old.employee_id) then
          new.decided_by := v_uid;
          new.decided_at := now();
        else
          raise exception 'Esta solicitação não pode mais ser cancelada';
        end if;
      else
        raise exception 'Transição de status inválida: % → %', old.status, new.status;
      end if;
    end if;

    -- Depois de decidida, datas e tipo ficam travados.
    if old.status <> 'pending'
       and (new.start_date, new.end_date, new.type, new.sell_days, new.employee_id)
           is distinct from (old.start_date, old.end_date, old.type, old.sell_days, old.employee_id) then
      raise exception 'Solicitação decidida não pode ser alterada; cancele e crie outra';
    end if;

    -- Titular sem papel de gestão só pode cancelar, nunca editar campos de decisão.
    if not v_privileged and new.status is not distinct from old.status
       and (new.decided_by, new.decided_at, new.decision_note)
           is distinct from (old.decided_by, old.decided_at, old.decision_note) then
      raise exception 'Alteração não permitida' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Sem sobreposição com outra solicitação pendente ou aprovada do mesmo colaborador.
  if new.status in ('pending','approved') and exists (
    select 1 from public.leave_requests l
    where l.employee_id = new.employee_id
      and l.id <> new.id
      and l.status in ('pending','approved')
      and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'Já existe uma ausência no mesmo período para este colaborador';
  end if;

  return new;
end;
$$;
create trigger leave_requests_rules before insert or update on public.leave_requests
  for each row execute function private.leave_request_rules();

-- ---------------------------------------------------------------------------
-- Fluxo de movimentações do DP com segregação de funções
-- draft → submitted → approved → exported; submitted → rejected;
-- draft/submitted → cancelled
-- ---------------------------------------------------------------------------
create or replace function private.dp_event_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft','submitted') then
      raise exception 'Movimentação nova deve começar como rascunho ou enviada';
    end if;
    new.created_by := coalesce(v_uid, new.created_by);
    new.approved_by := null; new.approved_at := null;
    new.exported_at := null; new.export_batch_id := null;
    return new;
  end if;

  if old.status in ('exported','cancelled','rejected') and v_uid is not null then
    raise exception 'Movimentação % não pode ser alterada', old.status;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft'     and new.status in ('submitted','cancelled')) or
      (old.status = 'submitted' and new.status in ('approved','rejected','cancelled','draft')) or
      (old.status = 'approved'  and new.status in ('exported','cancelled'))
    ) then
      raise exception 'Transição de status inválida: % → %', old.status, new.status;
    end if;

    if new.status = 'approved' then
      if v_uid is not null and v_uid = old.created_by then
        raise exception 'Quem cadastrou a movimentação não pode aprová-la (segregação de funções)'
          using errcode = 'insufficient_privilege';
      end if;
      new.approved_by := v_uid;
      new.approved_at := now();
    elsif new.status = 'exported' then
      if new.export_batch_id is null then
        raise exception 'Exportação exige um lote';
      end if;
      new.exported_at := now();
    end if;
  end if;

  -- Conteúdo só é editável em rascunho
  if old.status <> 'draft' and new.status not in ('draft')
     and (new.type, new.effective_date, new.payload, new.employee_id)
         is distinct from (old.type, old.effective_date, old.payload, old.employee_id) then
    raise exception 'Somente rascunhos podem ter o conteúdo alterado';
  end if;

  -- Campos de controle não são graváveis diretamente
  if new.status = old.status then
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.exported_at := old.exported_at; new.export_batch_id := old.export_batch_id;
  end if;
  new.created_by := old.created_by;
  return new;
end;
$$;
create trigger dp_events_rules before insert or update on public.dp_events
  for each row execute function private.dp_event_rules();

-- ---------------------------------------------------------------------------
-- Auditoria genérica. Para dados sensíveis, registra apenas QUAIS campos
-- mudaram, nunca os valores (minimização — LGPD art. 6º, III).
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_sensitive boolean := tg_table_name in ('employee_sensitive','dependents');
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_new) k
    where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
    if v_changed is null then
      return null; -- nada mudou de fato
    end if;
  end if;

  insert into public.audit_log (organization_id, actor_id, table_name, record_id, action,
                                old_data, new_data, changed_fields)
  values (
    (v_row ->> 'organization_id')::uuid,
    auth.uid(),
    tg_table_name,
    coalesce((v_row ->> 'id'), (v_row ->> 'employee_id'))::uuid,
    tg_op,
    case when v_sensitive then null else v_old end,
    case when v_sensitive then null else v_new end,
    v_changed
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['organizations','units','departments','positions','memberships',
                           'employees','employee_sensitive','dependents','leave_requests',
                           'dp_events','payroll_export_batches','time_imports','employee_documents']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Primeiro administrador. Executar no SQL Editor (não exposto na API):
--   select private.bootstrap_admin('email@empresa.com.br', '<organization_id>');
-- Só funciona enquanto a organização ainda não tem administrador.
-- ---------------------------------------------------------------------------
create or replace function private.bootstrap_admin(p_email text, p_org uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_id uuid;
begin
  if exists (select 1 from public.memberships
             where organization_id = p_org and role = 'admin' and unit_id is null and active) then
    raise exception 'A organização já possui administrador';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Usuário % não encontrado: faça o primeiro login antes', p_email;
  end if;
  insert into public.memberships (user_id, organization_id, role)
  values (v_user, p_org, 'admin') returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function private.bootstrap_admin(text, uuid) from public, authenticated;
