-- C'Art People OS — esquema central
-- Multi-organização e multi-unidade desde o início. Todo dado de pessoa carrega
-- organization_id e unit_id para que as políticas RLS possam filtrar por escopo.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Estrutura organizacional
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 1),
  legal_name  text,
  cnpj        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.units (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  name             text not null check (length(trim(name)) > 1),
  code             text not null,
  cnpj             text,
  city             text,
  state            char(2),
  timezone         text not null default 'America/Fortaleza',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.departments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid references public.units(id) on delete restrict,
  name             text not null check (length(trim(name)) > 1),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, unit_id, name)
);

create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  title            text not null check (length(trim(title)) > 1),
  cbo              text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, title)
);

-- ---------------------------------------------------------------------------
-- Acesso: papéis por organização, opcionalmente restritos a uma unidade.
-- unit_id nulo = o papel vale para todas as unidades da organização.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  unit_id          uuid references public.units(id) on delete cascade,
  role             text not null check (role in ('admin','rh','dp','gestor','diretoria','colaborador')),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id)
);
create unique index memberships_unique_scope
  on public.memberships (user_id, organization_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index memberships_user_idx on public.memberships (user_id) where active;

-- ---------------------------------------------------------------------------
-- Colaboradores — dados de uso amplo (sem CPF, salário, banco ou saúde)
-- ---------------------------------------------------------------------------
create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  unit_id              uuid not null references public.units(id) on delete restrict,
  department_id        uuid references public.departments(id) on delete set null,
  position_id          uuid references public.positions(id) on delete set null,
  manager_id           uuid references public.employees(id) on delete set null,
  user_id              uuid unique references auth.users(id) on delete set null,
  registration_number  text not null,
  full_name            text not null check (length(trim(full_name)) > 2),
  social_name          text,
  work_email           text,
  phone                text,
  employment_type      text not null default 'clt'
                       check (employment_type in ('clt','pj','estagio','temporario','aprendiz','intermitente')),
  work_schedule        text,
  status               text not null default 'active'
                       check (status in ('onboarding','active','on_leave','terminated')),
  hire_date            date not null,
  termination_date     date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, registration_number),
  check (termination_date is null or termination_date >= hire_date),
  check (manager_id is null or manager_id <> id)
);
create index employees_scope_idx on public.employees (organization_id, unit_id, status);
create index employees_manager_idx on public.employees (manager_id);

-- Dados pessoais sensíveis (LGPD) — tabela separada com política própria.
create table public.employee_sensitive (
  employee_id        uuid primary key references public.employees(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  unit_id            uuid not null references public.units(id) on delete restrict,
  cpf                text check (cpf is null or cpf ~ '^\d{11}$'),
  rg                 text,
  birth_date         date,
  pis                text check (pis is null or pis ~ '^\d{11}$'),
  base_salary        numeric(12,2) check (base_salary is null or base_salary >= 0),
  bank_name          text,
  bank_agency        text,
  bank_account       text,
  pix_key            text,
  address            jsonb not null default '{}'::jsonb,
  emergency_contact  jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

create table public.dependents (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  full_name        text not null,
  relationship     text not null check (relationship in ('conjuge','filho','enteado','pai_mae','outro')),
  birth_date       date,
  cpf              text check (cpf is null or cpf ~ '^\d{11}$'),
  ir_dependent     boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Férias e ausências
-- ---------------------------------------------------------------------------
create table public.leave_requests (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete restrict,
  unit_id                   uuid not null references public.units(id) on delete restrict,
  employee_id               uuid not null references public.employees(id) on delete cascade,
  type                      text not null check (type in (
                              'ferias','licenca_medica','licenca_maternidade','licenca_paternidade',
                              'falta_justificada','folga','outro')),
  start_date                date not null,
  end_date                  date not null,
  days                      integer generated always as ((end_date - start_date) + 1) stored,
  sell_days                 integer not null default 0 check (sell_days between 0 and 10),
  acquisition_period_start  date,
  reason                    text,
  status                    text not null default 'pending'
                            check (status in ('pending','approved','rejected','cancelled')),
  requested_by              uuid references auth.users(id),
  decided_by                uuid references auth.users(id),
  decided_at                timestamptz,
  decision_note             text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (end_date >= start_date),
  check (type = 'ferias' or sell_days = 0)
);
create index leave_requests_scope_idx on public.leave_requests (organization_id, unit_id, status, start_date);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);

-- ---------------------------------------------------------------------------
-- Departamento Pessoal — movimentações enviadas ao processamento oficial
-- ---------------------------------------------------------------------------
create table public.payroll_export_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid references public.units(id) on delete restrict,
  provider         text not null,
  period           text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  file_name        text not null,
  event_count      integer not null default 0,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

create table public.dp_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  employee_id      uuid not null references public.employees(id) on delete restrict,
  type             text not null check (type in (
                     'admissao','alteracao_salarial','alteracao_cargo','transferencia',
                     'afastamento','retorno_afastamento','desligamento','ferias','outro')),
  effective_date   date not null,
  payload          jsonb not null default '{}'::jsonb,
  notes            text,
  status           text not null default 'draft'
                   check (status in ('draft','submitted','approved','rejected','exported','cancelled')),
  created_by       uuid references auth.users(id),
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  exported_at      timestamptz,
  export_batch_id  uuid references public.payroll_export_batches(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index dp_events_scope_idx on public.dp_events (organization_id, unit_id, status, effective_date);

-- ---------------------------------------------------------------------------
-- Ponto — dados importados da solução de ponto existente (não é o REP)
-- ---------------------------------------------------------------------------
create table public.time_imports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  provider         text not null,
  file_name        text not null,
  period_start     date not null,
  period_end       date not null,
  row_count        integer not null default 0,
  rejected_count   integer not null default 0,
  imported_by      uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  check (period_end >= period_start)
);

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete restrict,
  unit_id           uuid not null references public.units(id) on delete restrict,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  work_date         date not null,
  worked_minutes    integer not null default 0 check (worked_minutes >= 0),
  overtime_minutes  integer not null default 0 check (overtime_minutes >= 0),
  absence_minutes   integer not null default 0 check (absence_minutes >= 0),
  night_minutes     integer not null default 0 check (night_minutes >= 0),
  source_import_id  uuid references public.time_imports(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index time_entries_scope_idx on public.time_entries (organization_id, unit_id, work_date);

-- ---------------------------------------------------------------------------
-- Documentos (arquivos no bucket privado employee-documents)
-- ---------------------------------------------------------------------------
create table public.employee_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  employee_id      uuid not null references public.employees(id) on delete cascade,
  category         text not null check (category in (
                     'contrato','documento_pessoal','aso','certificado','advertencia','ferias','rescisao','outro')),
  file_name        text not null,
  storage_path     text not null unique,
  expires_at       date,
  uploaded_by      uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoria (somente inserção) e registro de consultas de IA
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid,
  actor_id         uuid,
  table_name       text not null,
  record_id        uuid,
  action           text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data         jsonb,
  new_data         jsonb,
  changed_fields   text[],
  created_at       timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create table public.ai_query_log (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  question         text not null,
  tools_used       text[] not null default '{}',
  created_at       timestamptz not null default now()
);
