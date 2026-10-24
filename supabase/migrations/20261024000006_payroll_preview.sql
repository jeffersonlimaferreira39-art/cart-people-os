-- ===========================================================================
-- Prévia de folha de pagamento.
-- Dados de remuneração por colaborador (perfil, rubricas fixas, lançamentos do
-- mês) e tabelas de cálculo (INSS, IRRF, salário-família, parâmetros).
-- O cálculo é uma PRÉVIA para conferência; a folha oficial continua com a
-- contabilidade. Todos os valores são sensíveis: só Admin, RH e DP (e o titular,
-- em leitura) acessam. A auditoria registra quem mudou o quê, sem os valores.
-- ===========================================================================

-- Papel em qualquer unidade da organização (tabelas de cálculo valem para todas).
create or replace function private.has_role_in_org(p_org uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.active
      and m.organization_id = p_org and m.role = any (p_roles)
  );
$$;
grant execute on function private.has_role_in_org(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Perfil de remuneração (1:1 com o colaborador). O salário-base continua em
-- employee_sensitive.base_salary.
-- ---------------------------------------------------------------------------
create table public.employee_payroll_profile (
  employee_id              uuid primary key references public.employees(id) on delete cascade,
  organization_id          uuid not null references public.organizations(id) on delete restrict,
  unit_id                  uuid not null references public.units(id) on delete restrict,
  salary_type              text not null default 'mensalista' check (salary_type in ('mensalista','horista')),
  monthly_hours            numeric(6,2) not null default 220 check (monthly_hours > 0 and monthly_hours <= 300),
  -- Vale-transporte: custo diário das passagens e dias úteis padrão no mês.
  vt_enabled               boolean not null default false,
  vt_daily_amount          numeric(10,2) not null default 0 check (vt_daily_amount >= 0),
  vt_days                  integer not null default 22 check (vt_days between 0 and 31),
  -- Vale-alimentação / refeição (crédito mensal) e coparticipação do colaborador (PAT: até 20%).
  va_monthly               numeric(10,2) not null default 0 check (va_monthly >= 0),
  vr_monthly               numeric(10,2) not null default 0 check (vr_monthly >= 0),
  food_discount_pct        numeric(5,2) not null default 0 check (food_discount_pct between 0 and 20),
  -- Planos e seguros: parte do colaborador (desconto) e da empresa (custo).
  health_plan_employee     numeric(10,2) not null default 0 check (health_plan_employee >= 0),
  health_plan_company      numeric(10,2) not null default 0 check (health_plan_company >= 0),
  dental_plan_employee     numeric(10,2) not null default 0 check (dental_plan_employee >= 0),
  life_insurance_employee  numeric(10,2) not null default 0 check (life_insurance_employee >= 0),
  -- Adicionais
  unhealthiness_grade      text not null default 'nenhum' check (unhealthiness_grade in ('nenhum','minimo','medio','maximo')),
  hazard_pay               boolean not null default false,
  -- Descontos legais/contratuais
  union_fee                numeric(10,2) not null default 0 check (union_fee >= 0),
  alimony_type             text not null default 'nenhuma' check (alimony_type in ('nenhuma','percentual','valor')),
  alimony_value            numeric(10,2) not null default 0 check (alimony_value >= 0),
  notes                    text check (notes is null or length(notes) <= 1000),
  updated_at               timestamptz not null default now(),
  check (alimony_type <> 'percentual' or alimony_value <= 100)
);

-- ---------------------------------------------------------------------------
-- Rubricas fixas (recorrentes) por colaborador: gratificações, consignado, etc.
-- ---------------------------------------------------------------------------
create table public.employee_payroll_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  kind             text not null check (kind in ('provento','desconto')),
  code             text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  description      text not null check (length(trim(description)) between 2 and 120),
  amount           numeric(12,2) check (amount is null or amount >= 0),
  percent          numeric(6,3) check (percent is null or (percent > 0 and percent <= 100)),
  incidence_inss   boolean not null default false,
  incidence_irrf   boolean not null default false,
  incidence_fgts   boolean not null default false,
  start_period     text not null check (start_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_period       text check (end_period is null or end_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((amount is null) <> (percent is null)),
  check (end_period is null or end_period >= start_period)
);
create index employee_payroll_items_employee_idx on public.employee_payroll_items (employee_id);

-- ---------------------------------------------------------------------------
-- Lançamentos variáveis da competência (horas extras, faltas, comissão, ...).
-- ---------------------------------------------------------------------------
create table public.payroll_entries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  period           text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  code             text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  quantity         numeric(10,2) check (quantity is null or quantity >= 0),
  amount           numeric(12,2) check (amount is null or amount >= 0),
  notes            text check (notes is null or length(notes) <= 300),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  check (quantity is not null or amount is not null)
);
create index payroll_entries_period_idx on public.payroll_entries (organization_id, period);
create index payroll_entries_employee_idx on public.payroll_entries (employee_id, period);

-- ---------------------------------------------------------------------------
-- Tabelas de cálculo com vigência. Sem registro, o sistema usa as tabelas de
-- referência do código (src/lib/domain/payroll-tables.ts).
-- ---------------------------------------------------------------------------
create table public.payroll_tax_tables (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  kind             text not null check (kind in ('inss','irrf','salario_familia','parametros')),
  valid_from       date not null,
  data             jsonb not null,
  notes            text check (notes is null or length(notes) <= 500),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, kind, valid_from),
  check (extract(day from valid_from) = 1)
);

-- ---------------------------------------------------------------------------
-- Gatilhos: escopo vindo do colaborador, updated_at, unidade acompanha o
-- colaborador (perfil e rubricas fixas) e auditoria sem valores.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['employee_payroll_profile','employee_payroll_items','payroll_entries']
  loop
    execute format('create trigger %I before insert or update of employee_id on public.%I
                    for each row execute function private.scope_from_employee()', t || '_scope', t);
  end loop;
  foreach t in array array['employee_payroll_profile','employee_payroll_items','payroll_tax_tables']
  loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['employee_payroll_profile','employee_payroll_items','payroll_entries','payroll_tax_tables']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;

create or replace function private.propagate_employee_unit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.unit_id is distinct from old.unit_id then
    update public.employee_sensitive       set unit_id = new.unit_id where employee_id = new.id;
    update public.dependents               set unit_id = new.unit_id where employee_id = new.id;
    update public.employee_documents       set unit_id = new.unit_id where employee_id = new.id;
    update public.employee_payroll_profile set unit_id = new.unit_id where employee_id = new.id;
    update public.employee_payroll_items   set unit_id = new.unit_id where employee_id = new.id;
    -- Histórico (ausências, DP, ponto, lançamentos do mês) permanece na unidade onde ocorreu.
  end if;
  return new;
end;
$$;

-- Auditoria: remuneração é dado sensível, registra só quem/quando/quais campos.
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_sensitive boolean := tg_table_name in ('employee_sensitive','dependents','employee_payroll_profile',
                                           'employee_payroll_items','payroll_entries');
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

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.employee_payroll_profile, public.employee_payroll_items,
  public.payroll_entries, public.payroll_tax_tables to authenticated;
grant all on public.employee_payroll_profile, public.employee_payroll_items,
  public.payroll_entries, public.payroll_tax_tables to service_role;
-- Lançamento do mês não se edita: exclui e lança de novo (fica na auditoria).
revoke update on public.payroll_entries from authenticated;

alter table public.employee_payroll_profile enable row level security;
alter table public.employee_payroll_items   enable row level security;
alter table public.payroll_entries          enable row level security;
alter table public.payroll_tax_tables       enable row level security;

create policy payroll_profile_select on public.employee_payroll_profile for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy payroll_profile_write on public.employee_payroll_profile for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy payroll_items_select on public.employee_payroll_items for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy payroll_items_write on public.employee_payroll_items for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

create policy payroll_entries_select on public.payroll_entries for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy payroll_entries_insert on public.payroll_entries for insert to authenticated
  with check (private.can_manage_people(organization_id, unit_id));
create policy payroll_entries_delete on public.payroll_entries for delete to authenticated
  using (private.can_manage_people(organization_id, unit_id));

-- Tabelas: leitura por Admin/RH/DP de qualquer unidade; alteração só por Admin/DP da organização inteira.
create policy payroll_tables_select on public.payroll_tax_tables for select to authenticated
  using (private.has_role_in_org(organization_id, array['admin','rh','dp']));
create policy payroll_tables_write on public.payroll_tax_tables for all to authenticated
  using (private.has_org_wide_role(organization_id, array['admin','dp']))
  with check (private.has_org_wide_role(organization_id, array['admin','dp']));
