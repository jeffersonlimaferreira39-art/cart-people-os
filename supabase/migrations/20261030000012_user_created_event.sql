-- Usuário criado pelo administrador geral com e-mail e senha provisória:
-- registrado no histórico de acessos, como as demais ações administrativas.
alter table public.access_events drop constraint access_events_event_check;
alter table public.access_events add constraint access_events_event_check
  check (event in ('login','login_falhou','link_enviado','logout',
                   'bloqueio','desbloqueio','sessoes_encerradas','link_reenviado','usuario_criado'));

drop policy access_events_admin_insert on public.access_events;
create policy access_events_admin_insert on public.access_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and event in ('bloqueio','desbloqueio','sessoes_encerradas','link_reenviado','usuario_criado')
    and private.can_audit_user(user_id)
  );
