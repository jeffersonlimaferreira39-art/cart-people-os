-- ===========================================================================
-- Registro de exportação de relatórios (LGPD: rastreabilidade de quem extraiu
-- dados de pessoas, quando, em que formato e com quais filtros).
-- Imutável para o usuário; leitura do próprio registro ou de admin org-wide.
-- ===========================================================================
create table public.report_exports (
  id               bigint generated always as identity primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  unit_id          uuid references public.units(id) on delete set null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  report           text not null check (report ~ '^[a-z_]{2,40}$'),
  format           text not null check (format in ('xlsx','csv','pdf')),
  filters          jsonb not null default '{}'::jsonb,
  row_count        integer not null default 0 check (row_count >= 0),
  created_at       timestamptz not null default now()
);
create index report_exports_org_created_idx on public.report_exports (organization_id, created_at desc);

grant select, insert on public.report_exports to authenticated;
grant all on public.report_exports to service_role;
revoke update, delete on public.report_exports from authenticated;
alter table public.report_exports enable row level security;

create policy report_exports_insert on public.report_exports for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.is_member(organization_id)
    and (unit_id is null or exists (
      select 1 from public.units u where u.id = unit_id and u.organization_id = report_exports.organization_id))
  );
create policy report_exports_select on public.report_exports for select to authenticated
  using (user_id = auth.uid() or private.has_org_wide_role(organization_id, array['admin']));
