-- C'Art People OS — RBAC + RLS
-- Funções auxiliares ficam no schema "private", que não é exposto pela API do
-- Supabase. São SECURITY DEFINER para consultar memberships/employees sem
-- recursão de políticas, e fixam search_path vazio contra sequestro de objetos.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Usuário tem algum dos papéis na organização, valendo para a unidade?
-- (membership com unit_id nulo vale para todas as unidades)
create or replace function private.has_role(p_org uuid, p_roles text[], p_unit uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.active
      and m.organization_id = p_org
      and m.role = any (p_roles)
      -- p_unit nulo (registro de escopo organizacional) exige papel org-wide
      and (m.unit_id is null or m.unit_id = p_unit)
  );
$$;

-- Papel com escopo de organização inteira (unit_id nulo)?
create or replace function private.has_org_wide_role(p_org uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.active
      and m.organization_id = p_org and m.unit_id is null
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.active and m.organization_id = p_org
  );
$$;

-- O colaborador pertence ao usuário logado?
create or replace function private.is_self(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee and e.user_id = auth.uid()
  );
$$;

-- O usuário logado é gestor (direto ou indireto, até 10 níveis) do colaborador?
create or replace function private.is_manager_of(p_employee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive chain(id, manager_id, depth) as (
    select e.id, e.manager_id, 0 from public.employees e where e.id = p_employee
    union all
    select m.id, m.manager_id, c.depth + 1
    from chain c join public.employees m on m.id = c.manager_id
    where c.depth < 10
  )
  select exists (
    select 1 from chain c
    join public.employees mgr on mgr.id = c.manager_id
    where mgr.user_id = auth.uid() and mgr.status <> 'terminated'
  );
$$;

-- Atalhos de leitura de escopo usados nas políticas
create or replace function private.can_manage_people(p_org uuid, p_unit uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(p_org, array['admin','rh','dp'], p_unit); $$;

create or replace function private.can_view_people(p_org uuid, p_unit uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.has_role(p_org, array['admin','rh','dp','diretoria'], p_unit); $$;

grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privilégios de tabela: anon não acessa nada; authenticated passa pela RLS.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Auditoria é somente leitura para usuários; quem grava é o trigger.
revoke insert, update, delete on public.audit_log from authenticated;
-- Log de IA: usuário só insere o próprio registro e lê o que a política permitir.
revoke update, delete on public.ai_query_log from authenticated;
-- Lotes de exportação são imutáveis depois de criados.
revoke update, delete on public.payroll_export_batches from authenticated;
revoke update on public.time_imports from authenticated;

-- Habilita RLS em todas as tabelas do domínio
alter table public.organizations           enable row level security;
alter table public.units                   enable row level security;
alter table public.departments             enable row level security;
alter table public.positions               enable row level security;
alter table public.memberships             enable row level security;
alter table public.employees               enable row level security;
alter table public.employee_sensitive      enable row level security;
alter table public.dependents              enable row level security;
alter table public.leave_requests          enable row level security;
alter table public.payroll_export_batches  enable row level security;
alter table public.dp_events               enable row level security;
alter table public.time_imports            enable row level security;
alter table public.time_entries            enable row level security;
alter table public.employee_documents      enable row level security;
alter table public.audit_log               enable row level security;
alter table public.ai_query_log            enable row level security;

-- ---------------------------------------------------------------------------
-- Organização e estrutura
-- ---------------------------------------------------------------------------
create policy org_select on public.organizations for select to authenticated
  using (private.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (private.has_org_wide_role(id, array['admin']))
  with check (private.has_org_wide_role(id, array['admin']));

create policy units_select on public.units for select to authenticated
  using (private.is_member(organization_id));
create policy units_write on public.units for all to authenticated
  using (private.has_org_wide_role(organization_id, array['admin']))
  with check (private.has_org_wide_role(organization_id, array['admin']));

create policy departments_select on public.departments for select to authenticated
  using (private.is_member(organization_id));
create policy departments_write on public.departments for all to authenticated
  using (private.has_role(organization_id, array['admin','rh'], unit_id))
  with check (private.has_role(organization_id, array['admin','rh'], unit_id));

create policy positions_select on public.positions for select to authenticated
  using (private.is_member(organization_id));
create policy positions_write on public.positions for all to authenticated
  using (private.has_org_wide_role(organization_id, array['admin','rh']))
  with check (private.has_org_wide_role(organization_id, array['admin','rh']));

-- Memberships: cada um vê as próprias; admin vê e gerencia as da organização.
-- Admin de unidade só concede papéis na própria unidade.
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or private.has_org_wide_role(organization_id, array['admin'])
    or (unit_id is not null and private.has_role(organization_id, array['admin'], unit_id))
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (
    private.has_org_wide_role(organization_id, array['admin'])
    or (unit_id is not null and private.has_role(organization_id, array['admin'], unit_id) and role <> 'admin')
  );
create policy memberships_update on public.memberships for update to authenticated
  using (private.has_org_wide_role(organization_id, array['admin']) and user_id <> auth.uid())
  with check (private.has_org_wide_role(organization_id, array['admin']));
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.has_org_wide_role(organization_id, array['admin']) and user_id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Colaboradores
-- ---------------------------------------------------------------------------
create policy employees_select on public.employees for select to authenticated
  using (
    private.can_view_people(organization_id, unit_id)
    or user_id = auth.uid()
    or private.is_manager_of(id)
  );
create policy employees_insert on public.employees for insert to authenticated
  with check (private.has_role(organization_id, array['admin','rh','dp'], unit_id));
create policy employees_update on public.employees for update to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));
create policy employees_delete on public.employees for delete to authenticated
  using (private.has_org_wide_role(organization_id, array['admin']));

-- Sensíveis: RH/DP/Admin da unidade, ou o próprio titular (somente leitura).
create policy sensitive_select on public.employee_sensitive for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy sensitive_write on public.employee_sensitive for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy dependents_select on public.dependents for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy dependents_write on public.dependents for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

-- ---------------------------------------------------------------------------
-- Férias e ausências — regras de transição ficam no trigger (migração 3)
-- ---------------------------------------------------------------------------
create policy leave_select on public.leave_requests for select to authenticated
  using (
    private.can_view_people(organization_id, unit_id)
    or private.is_self(employee_id)
    or private.is_manager_of(employee_id)
  );
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (
    private.is_self(employee_id)
    or private.is_manager_of(employee_id)
    or private.can_manage_people(organization_id, unit_id)
  );
create policy leave_update on public.leave_requests for update to authenticated
  using (
    private.is_self(employee_id)
    or private.is_manager_of(employee_id)
    or private.can_manage_people(organization_id, unit_id)
  )
  with check (
    private.is_self(employee_id)
    or private.is_manager_of(employee_id)
    or private.can_manage_people(organization_id, unit_id)
  );
-- Sem política de DELETE: solicitações são canceladas, nunca apagadas.

-- ---------------------------------------------------------------------------
-- Departamento Pessoal
-- ---------------------------------------------------------------------------
create policy dp_select on public.dp_events for select to authenticated
  using (private.has_role(organization_id, array['admin','rh','dp','diretoria'], unit_id));
create policy dp_insert on public.dp_events for insert to authenticated
  with check (private.can_manage_people(organization_id, unit_id));
create policy dp_update on public.dp_events for update to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy batches_select on public.payroll_export_batches for select to authenticated
  using (private.has_role(organization_id, array['admin','dp'], unit_id));
create policy batches_insert on public.payroll_export_batches for insert to authenticated
  with check (private.has_role(organization_id, array['admin','dp'], unit_id));

-- ---------------------------------------------------------------------------
-- Ponto
-- ---------------------------------------------------------------------------
create policy time_imports_select on public.time_imports for select to authenticated
  using (private.has_role(organization_id, array['admin','rh','dp'], unit_id));
create policy time_imports_insert on public.time_imports for insert to authenticated
  with check (private.has_role(organization_id, array['admin','dp'], unit_id));
create policy time_imports_delete on public.time_imports for delete to authenticated
  using (private.has_role(organization_id, array['admin','dp'], unit_id));

create policy time_entries_select on public.time_entries for select to authenticated
  using (
    private.can_view_people(organization_id, unit_id)
    or private.is_self(employee_id)
    or private.is_manager_of(employee_id)
  );
create policy time_entries_write on public.time_entries for all to authenticated
  using (private.has_role(organization_id, array['admin','dp'], unit_id))
  with check (private.has_role(organization_id, array['admin','dp'], unit_id));

-- ---------------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------------
create policy documents_select on public.employee_documents for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy documents_write on public.employee_documents for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

-- ---------------------------------------------------------------------------
-- Auditoria e IA
-- ---------------------------------------------------------------------------
create policy audit_select on public.audit_log for select to authenticated
  using (private.has_org_wide_role(organization_id, array['admin']));

create policy ai_log_insert on public.ai_query_log for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(organization_id));
create policy ai_log_select on public.ai_query_log for select to authenticated
  using (user_id = auth.uid() or private.has_org_wide_role(organization_id, array['admin']));
