-- ===========================================================================
-- Contratação: vagas → candidatos (funil por etapas) → admissão com checklist.
-- Dados de candidatos são pessoais (LGPD): só RH/Admin mantêm; DP lê (admissão);
-- o consentimento do candidato é obrigatório no cadastro.
-- Currículos no bucket privado "recruitment": {organization_id}/{candidate_id}/{uuid}-{nome}.
-- ===========================================================================

create table public.job_openings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  department_id    uuid references public.departments(id) on delete set null,
  position_id      uuid references public.positions(id) on delete set null,
  title            text not null check (length(trim(title)) between 2 and 120),
  description      text check (description is null or length(description) <= 4000),
  openings         integer not null default 1 check (openings between 1 and 500),
  employment_type  text not null default 'clt'
                   check (employment_type in ('clt','pj','estagio','temporario','aprendiz','intermitente')),
  salary_range     text check (salary_range is null or length(salary_range) <= 80),
  status           text not null default 'aberta' check (status in ('aberta','pausada','encerrada')),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  closed_at        timestamptz
);
create index job_openings_org_status_idx on public.job_openings (organization_id, status);

create table public.candidates (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete restrict,
  unit_id            uuid not null references public.units(id) on delete restrict,
  opening_id         uuid not null references public.job_openings(id) on delete restrict,
  full_name          text not null check (length(trim(full_name)) between 3 and 120),
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text check (phone is null or length(phone) <= 30),
  source             text not null default 'outro' check (source in ('indicacao','site','linkedin','agencia','outro')),
  stage              text not null default 'triagem'
                     check (stage in ('triagem','entrevista','teste','proposta','aprovado','reprovado','desistiu','contratado')),
  notes              text check (notes is null or length(notes) <= 4000),
  resume_path        text unique,
  resume_name        text check (resume_name is null or length(resume_name) <= 200),
  consent_at         timestamptz not null,
  hired_employee_id  uuid references public.employees(id) on delete set null,
  created_by         uuid references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (resume_path is null or resume_path like organization_id::text || '/' || id::text || '/%'),
  check (stage <> 'contratado' or hired_employee_id is not null)
);
create index candidates_opening_idx on public.candidates (opening_id, stage);

create table public.candidate_events (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  unit_id          uuid not null references public.units(id) on delete cascade,
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  from_stage       text,
  to_stage         text not null,
  note             text check (note is null or length(note) <= 1000),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now()
);
create index candidate_events_candidate_idx on public.candidate_events (candidate_id, created_at);

create table public.admission_checklist (
  employee_id      uuid not null references public.employees(id) on delete cascade,
  item             text not null check (item ~ '^[a-z_]{2,40}$'),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid not null references public.units(id) on delete restrict,
  label            text not null check (length(label) between 2 and 120),
  position         smallint not null default 0,
  done             boolean not null default false,
  done_at          timestamptz,
  done_by          uuid references auth.users(id),
  primary key (employee_id, item)
);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------
-- Vaga: unidade, departamento e cargo da mesma organização; data de encerramento automática.
create or replace function private.job_opening_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.units u where u.id = new.unit_id and u.organization_id = new.organization_id) then
    raise exception 'Unidade não pertence à organização' using errcode = 'check_violation';
  end if;
  if new.department_id is not null and not exists (select 1 from public.departments d where d.id = new.department_id and d.organization_id = new.organization_id) then
    raise exception 'Departamento de outra organização' using errcode = 'check_violation';
  end if;
  if new.position_id is not null and not exists (select 1 from public.positions p where p.id = new.position_id and p.organization_id = new.organization_id) then
    raise exception 'Cargo de outra organização' using errcode = 'check_violation';
  end if;
  if new.status = 'encerrada' and (tg_op = 'INSERT' or old.status <> 'encerrada') then new.closed_at := now(); end if;
  if new.status <> 'encerrada' then new.closed_at := null; end if;
  return new;
end;
$$;
create trigger job_openings_rules before insert or update on public.job_openings
  for each row execute function private.job_opening_rules();

-- Candidato herda organização/unidade da vaga; vaga encerrada não recebe candidatos.
create or replace function private.candidate_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_unit uuid; v_status text;
begin
  select o.organization_id, o.unit_id, o.status into v_org, v_unit, v_status from public.job_openings o where o.id = new.opening_id;
  if v_org is null then raise exception 'Vaga não encontrada' using errcode = 'foreign_key_violation'; end if;
  if tg_op = 'INSERT' and v_status = 'encerrada' then raise exception 'Vaga encerrada não recebe candidatos.'; end if;
  new.organization_id := v_org;
  new.unit_id := v_unit;
  return new;
end;
$$;
create trigger candidates_rules before insert or update of opening_id on public.candidates
  for each row execute function private.candidate_rules();

-- Histórico de etapas automático.
create or replace function private.candidate_stage_log()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.candidate_events (organization_id, unit_id, candidate_id, from_stage, to_stage, created_by)
    values (new.organization_id, new.unit_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage, auth.uid());
  end if;
  return null;
end;
$$;
create trigger candidates_stage_log after insert or update of stage on public.candidates
  for each row execute function private.candidate_stage_log();

do $$
declare t text;
begin
  execute 'create trigger admission_checklist_scope before insert or update of employee_id on public.admission_checklist
           for each row execute function private.scope_from_employee()';
  foreach t in array array['job_openings','candidates'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['job_openings','candidates','admission_checklist'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.job_openings, public.candidates, public.admission_checklist to authenticated;
grant select, insert on public.candidate_events to authenticated;
grant all on public.job_openings, public.candidates, public.candidate_events, public.admission_checklist to service_role;
alter table public.job_openings        enable row level security;
alter table public.candidates          enable row level security;
alter table public.candidate_events    enable row level security;
alter table public.admission_checklist enable row level security;

-- Vagas: quem vê pessoas na unidade (admin, rh, dp, diretoria) lê; RH/Admin mantêm.
create policy job_openings_select on public.job_openings for select to authenticated
  using (private.can_view_people(organization_id, unit_id));
create policy job_openings_write on public.job_openings for all to authenticated
  using (private.has_role(organization_id, array['admin','rh'], unit_id))
  with check (private.has_role(organization_id, array['admin','rh'], unit_id));

-- Candidatos e histórico: RH/Admin mantêm; DP lê (prepara a admissão).
create policy candidates_select on public.candidates for select to authenticated
  using (private.has_role(organization_id, array['admin','rh','dp'], unit_id));
create policy candidates_write on public.candidates for all to authenticated
  using (private.has_role(organization_id, array['admin','rh'], unit_id))
  with check (private.has_role(organization_id, array['admin','rh'], unit_id));
create policy candidate_events_select on public.candidate_events for select to authenticated
  using (private.has_role(organization_id, array['admin','rh','dp'], unit_id));
create policy candidate_events_insert on public.candidate_events for insert to authenticated
  with check (private.has_role(organization_id, array['admin','rh'], unit_id));

-- Checklist de admissão: RH/DP/Admin da unidade; o próprio admitido lê.
create policy admission_checklist_select on public.admission_checklist for select to authenticated
  using (private.can_manage_people(organization_id, unit_id) or private.is_self(employee_id));
create policy admission_checklist_write on public.admission_checklist for all to authenticated
  using (private.can_manage_people(organization_id, unit_id))
  with check (private.can_manage_people(organization_id, unit_id));

-- ---------------------------------------------------------------------------
-- Currículos (ignorado em bancos de teste sem o schema storage)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente — políticas de arquivos ignoradas (ambiente de teste)';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('recruitment', 'recruitment', false, 5242880, array['application/pdf','image/jpeg','image/png',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do nothing;

  execute $p$
    create policy "recruitment: leitura conforme candidato"
    on storage.objects for select to authenticated
    using (bucket_id = 'recruitment' and exists (select 1 from public.candidates c where c.resume_path = storage.objects.name))
  $p$;
  execute $p$
    create policy "recruitment: envio por RH"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'recruitment'
      and exists (
        select 1 from public.candidates c
        where c.id::text = (storage.foldername(name))[2]
          and c.organization_id::text = (storage.foldername(name))[1]
          and private.has_role(c.organization_id, array['admin','rh'], c.unit_id)
      )
    )
  $p$;
  execute $p$
    create policy "recruitment: exclusão por RH"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'recruitment'
      and exists (
        select 1 from public.candidates c
        where c.id::text = (storage.foldername(name))[2]
          and private.has_role(c.organization_id, array['admin','rh'], c.unit_id)
      )
    )
  $p$;
end $$;
