-- Reproduz o mínimo do ambiente Supabase num Postgres puro para testar
-- migrações e RLS em CI, sem Docker. NÃO executar no projeto Supabase.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique,
  created_at         timestamptz default now(),
  invited_at         timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  banned_until       timestamptz
);

create table if not exists auth.sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  refreshed_at timestamp,
  user_agent   text,
  ip           inet
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role';
$$;
