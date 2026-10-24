-- ===========================================================================
-- Documentos do RH e do DP (não vinculados a um colaborador): políticas,
-- regulamento, convenção coletiva, PGR/PCMSO, guias, folhas, faturas, eSocial.
--
-- Acesso:
--   * Envio/exclusão: RH (admin, rh) na área "rh"; DP (admin, dp) na área "dp",
--     na unidade do documento (sem unidade = exige papel da organização inteira).
--   * Leitura: Admin/RH/DP da organização; e todos os membros quando o
--     documento é marcado como visível a todos (ex.: regulamento interno).
-- Arquivos no bucket privado "org-documents": {organization_id}/{area}/{uuid}-{nome}.
-- ===========================================================================

create table public.org_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  unit_id          uuid references public.units(id) on delete restrict,
  area             text not null check (area in ('rh','dp')),
  category         text not null check (category ~ '^[a-z_]{2,40}$'),
  title            text not null check (length(trim(title)) between 2 and 160),
  description      text check (description is null or length(description) <= 500),
  period           text check (period is null or period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  expires_at       date,
  visibility       text not null default 'restrito' check (visibility in ('restrito','todos')),
  file_name        text not null check (length(file_name) between 1 and 200),
  storage_path     text not null unique,
  uploaded_by      uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now(),
  -- O arquivo fica na pasta da organização e da área do registro.
  check (storage_path like organization_id::text || '/' || area || '/%')
);
create index org_documents_org_area_idx on public.org_documents (organization_id, area, created_at desc);

-- Unidade (quando informada) precisa ser da mesma organização.
create or replace function private.org_document_rules()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.unit_id is not null and not exists (
    select 1 from public.units u where u.id = new.unit_id and u.organization_id = new.organization_id
  ) then
    raise exception 'Unidade não pertence à organização' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and (new.storage_path <> old.storage_path or new.organization_id <> old.organization_id or new.area <> old.area) then
    raise exception 'Arquivo, organização e área do documento não mudam; envie um novo documento.';
  end if;
  return new;
end;
$$;
create trigger org_documents_rules before insert or update on public.org_documents
  for each row execute function private.org_document_rules();

create trigger org_documents_audit after insert or update or delete on public.org_documents
  for each row execute function private.audit_row();

grant select, insert, update, delete on public.org_documents to authenticated;
grant all on public.org_documents to service_role;
alter table public.org_documents enable row level security;

-- Quem pode manter documentos de uma área.
create or replace function private.can_manage_org_document(p_org uuid, p_area text, p_unit uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_role(p_org, case p_area when 'rh' then array['admin','rh'] else array['admin','dp'] end, p_unit);
$$;
grant execute on function private.can_manage_org_document(uuid, text, uuid) to authenticated, service_role;

create policy org_documents_select on public.org_documents for select to authenticated
  using (
    private.has_role_in_org(organization_id, array['admin','rh','dp'])
    or (visibility = 'todos' and private.is_member(organization_id))
  );
create policy org_documents_insert on public.org_documents for insert to authenticated
  with check (private.can_manage_org_document(organization_id, area, unit_id));
create policy org_documents_update on public.org_documents for update to authenticated
  using (private.can_manage_org_document(organization_id, area, unit_id))
  with check (private.can_manage_org_document(organization_id, area, unit_id));
create policy org_documents_delete on public.org_documents for delete to authenticated
  using (private.can_manage_org_document(organization_id, area, unit_id));

-- ---------------------------------------------------------------------------
-- Armazenamento (ignorado em bancos de teste sem o schema storage)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente — políticas de arquivos ignoradas (ambiente de teste)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('org-documents', 'org-documents', false, 10485760, array[
    'application/pdf','image/jpeg','image/png','text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do nothing;

  -- Leitura: só existe se o usuário enxerga o registro (a RLS da tabela vale aqui).
  execute $p$
    create policy "org-documents: leitura conforme registro"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'org-documents'
      and exists (select 1 from public.org_documents d where d.storage_path = storage.objects.name)
    )
  $p$;

  execute $p$
    create policy "org-documents: envio pela área"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'org-documents'
      and (storage.foldername(name))[2] in ('rh','dp')
      and private.has_role_in_org(
        ((storage.foldername(name))[1])::uuid,
        case (storage.foldername(name))[2] when 'rh' then array['admin','rh'] else array['admin','dp'] end)
    )
  $p$;

  execute $p$
    create policy "org-documents: exclusão conforme registro"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'org-documents'
      and exists (
        select 1 from public.org_documents d
        where d.storage_path = storage.objects.name
          and private.can_manage_org_document(d.organization_id, d.area, d.unit_id)
      )
    )
  $p$;
end $$;
