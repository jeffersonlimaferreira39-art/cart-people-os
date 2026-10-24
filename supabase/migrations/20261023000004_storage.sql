-- C'Art People OS — bucket privado de documentos
-- Caminho obrigatório: {organization_id}/{employee_id}/{uuid}-{nome-do-arquivo}
-- O acesso ao arquivo segue a mesma regra da tabela employee_documents.
-- Guardado por verificação do schema storage para rodar também em bancos de teste.

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'schema storage ausente — políticas de arquivos ignoradas (ambiente de teste)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('employee-documents', 'employee-documents', false, 10485760,
          array['application/pdf','image/jpeg','image/png'])
  on conflict (id) do nothing;

  execute $p$
    create policy "documentos: leitura conforme cadastro"
    on storage.objects for select to authenticated
    using (
      bucket_id = 'employee-documents'
      and exists (
        select 1 from public.employee_documents d
        where d.storage_path = storage.objects.name
      )
    )
  $p$;

  execute $p$
    create policy "documentos: envio por RH/DP"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'employee-documents'
      and exists (
        select 1 from public.employees e
        where e.organization_id::text = (storage.foldername(name))[1]
          and e.id::text = (storage.foldername(name))[2]
          and private.can_manage_people(e.organization_id, e.unit_id)
      )
    )
  $p$;

  execute $p$
    create policy "documentos: exclusão por RH/DP"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'employee-documents'
      and exists (
        select 1 from public.employees e
        where e.organization_id::text = (storage.foldername(name))[1]
          and e.id::text = (storage.foldername(name))[2]
          and private.can_manage_people(e.organization_id, e.unit_id)
      )
    )
  $p$;
end $$;
