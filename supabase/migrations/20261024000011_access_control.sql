-- ===========================================================================
-- Controle de acesso: revisão periódica dos papéis, bloqueio reversível,
-- histórico de acessos e sessões. Só o administrador geral (org-wide) gerencia.
-- Bloqueio = papéis suspensos (active=false + suspended_at) + sessões encerradas
-- + banimento no Auth (feito pela aplicação com a chave secreta).
-- ===========================================================================

alter table public.memberships
  add column reviewed_at  timestamptz,
  add column reviewed_by  uuid references auth.users(id) on delete set null,
  add column suspended_at timestamptz;
alter table public.memberships
  add constraint memberships_suspended_inactive check (suspended_at is null or not active);

-- Papéis existentes: revisão conta a partir da criação.
update public.memberships set reviewed_at = created_at where reviewed_at is null;

-- Carimbo de revisão sempre do servidor: quem revisou e quando. Mudar papel ou
-- escopo conta como revisão; reativar limpa a suspensão.
create or replace function private.membership_review_stamp()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    new.suspended_at := null;
    return new;
  end if;
  if new.reviewed_at is distinct from old.reviewed_at
     or new.role is distinct from old.role
     or new.unit_id is distinct from old.unit_id then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  else
    new.reviewed_by := old.reviewed_by;
  end if;
  if new.active then new.suspended_at := null; end if;
  return new;
end;
$$;
create trigger memberships_review_stamp before insert or update on public.memberships
  for each row execute function private.membership_review_stamp();

-- O administrador geral audita usuários que têm (ou tiveram) papel na organização dele.
create or replace function private.can_audit_user(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user
      and private.has_org_wide_role(m.organization_id, array['admin'])
  );
$$;

-- ---------------------------------------------------------------------------
-- Histórico de acessos (login, falhas, saídas e ações administrativas)
-- ---------------------------------------------------------------------------
create table public.access_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event       text not null check (event in ('login','login_falhou','link_enviado','logout',
                                              'bloqueio','desbloqueio','sessoes_encerradas','link_reenviado')),
  ip          text check (ip is null or length(ip) <= 64),
  user_agent  text check (user_agent is null or length(user_agent) <= 400),
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index access_events_user_idx on public.access_events (user_id, created_at desc);
create index access_events_created_idx on public.access_events (created_at desc);

grant select, insert on public.access_events to authenticated;
grant all on public.access_events to service_role;
alter table public.access_events enable row level security;

create policy access_events_select on public.access_events for select to authenticated
  using (user_id = auth.uid() or private.can_audit_user(user_id));
-- Ações administrativas: registradas pelo próprio administrador, em nome dele.
create policy access_events_admin_insert on public.access_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and event in ('bloqueio','desbloqueio','sessoes_encerradas','link_reenviado')
    and private.can_audit_user(user_id)
  );

-- Eventos de login são gravados pelo servidor (chave secreta), localizando o
-- usuário pelo e-mail. E-mail desconhecido não é registrado (não guardamos
-- endereços digitados por terceiros).
create or replace function public.record_access_event(p_email text, p_event text, p_ip text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if p_event not in ('login','login_falhou','link_enviado','logout') then
    raise exception 'Evento inválido';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then return; end if;
  insert into public.access_events (user_id, event, ip, user_agent)
  values (v_user, p_event, left(p_ip, 64), left(p_user_agent, 400));
end;
$$;
revoke execute on function public.record_access_event(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_access_event(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Dados de autenticação dos usuários da organização (sem a chave secreta)
-- ---------------------------------------------------------------------------
create or replace function public.org_users(p_org uuid)
returns table (
  user_id uuid, email text, created_at timestamptz, invited_at timestamptz,
  email_confirmed_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_org_wide_role(p_org, array['admin']) then
    raise exception 'Apenas o administrador geral' using errcode = 'insufficient_privilege';
  end if;
  return query
    select u.id, u.email::text, u.created_at, u.invited_at, u.email_confirmed_at, u.last_sign_in_at, u.banned_until
    from auth.users u
    where exists (select 1 from public.memberships m where m.user_id = u.id and m.organization_id = p_org);
end;
$$;

create or replace function public.org_user_sessions(p_org uuid)
returns table (session_id uuid, user_id uuid, created_at timestamptz, last_seen timestamptz, user_agent text, ip text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_org_wide_role(p_org, array['admin']) then
    raise exception 'Apenas o administrador geral' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.id, s.user_id, s.created_at,
           greatest(s.updated_at, s.refreshed_at::timestamptz, s.created_at),
           left(s.user_agent, 400), host(s.ip)
    from auth.sessions s
    where exists (select 1 from public.memberships m where m.user_id = s.user_id and m.organization_id = p_org)
    order by 4 desc;
end;
$$;

-- Encerra todas as sessões (revoga os tokens de renovação) de um usuário da organização.
create or replace function public.end_user_sessions(p_org uuid, p_user uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if not private.has_org_wide_role(p_org, array['admin']) then
    raise exception 'Apenas o administrador geral' using errcode = 'insufficient_privilege';
  end if;
  if p_user = auth.uid() then raise exception 'Use "Sair" para encerrar a própria sessão.'; end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_user and m.organization_id = p_org) then
    raise exception 'Usuário não pertence à organização' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.org_users(uuid), public.org_user_sessions(uuid), public.end_user_sessions(uuid, uuid) from public, anon;
grant execute on function public.org_users(uuid), public.org_user_sessions(uuid), public.end_user_sessions(uuid, uuid) to authenticated, service_role;
