-- Usuário criado pelo administrador geral com e-mail e senha provisória, e
-- trocas de senha: registrados no histórico de acessos.
-- Idempotente (reflete o estado já aplicado em produção).
alter table public.access_events drop constraint if exists access_events_event_check;
alter table public.access_events add constraint access_events_event_check
  check (event in ('login','login_falhou','link_enviado','logout',
                   'bloqueio','desbloqueio','sessoes_encerradas','link_reenviado',
                   'usuario_criado','senha_definida','senha_alterada'));

drop policy if exists access_events_admin_insert on public.access_events;
create policy access_events_admin_insert on public.access_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and event in ('bloqueio','desbloqueio','sessoes_encerradas','link_reenviado','usuario_criado','senha_definida')
    and private.can_audit_user(user_id)
  );

-- O próprio usuário registra a troca da sua senha.
drop policy if exists access_events_self_insert on public.access_events;
create policy access_events_self_insert on public.access_events for insert to authenticated
  with check (user_id = auth.uid() and actor_id = auth.uid() and event = 'senha_alterada');
