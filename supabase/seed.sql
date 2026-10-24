-- Dados iniciais para desenvolvimento local (`supabase db reset`).
-- Em produção, crie organização e unidades pelo SQL Editor ou pela tela de Configurações.

insert into public.organizations (id, name, legal_name)
values ('0c0a0000-0000-4000-8000-000000000001', 'C''Art Ambientações', 'C''Art Ambientações Ltda.')
on conflict (id) do nothing;

insert into public.units (id, organization_id, name, code, city, state) values
  ('0c0a0000-0000-4000-8000-0000000000a1', '0c0a0000-0000-4000-8000-000000000001', 'Matriz', 'MTZ', 'Fortaleza', 'CE')
on conflict (id) do nothing;

insert into public.departments (organization_id, unit_id, name) values
  ('0c0a0000-0000-4000-8000-000000000001', '0c0a0000-0000-4000-8000-0000000000a1', 'Administrativo'),
  ('0c0a0000-0000-4000-8000-000000000001', '0c0a0000-0000-4000-8000-0000000000a1', 'Comercial'),
  ('0c0a0000-0000-4000-8000-000000000001', '0c0a0000-0000-4000-8000-0000000000a1', 'Projetos'),
  ('0c0a0000-0000-4000-8000-000000000001', '0c0a0000-0000-4000-8000-0000000000a1', 'Produção e montagem')
on conflict do nothing;

insert into public.positions (organization_id, title, cbo) values
  ('0c0a0000-0000-4000-8000-000000000001', 'Arquiteto(a) de interiores', '214125'),
  ('0c0a0000-0000-4000-8000-000000000001', 'Projetista', '318705'),
  ('0c0a0000-0000-4000-8000-000000000001', 'Consultor(a) comercial', '354145'),
  ('0c0a0000-0000-4000-8000-000000000001', 'Montador(a) de móveis', '774105'),
  ('0c0a0000-0000-4000-8000-000000000001', 'Assistente administrativo', '411010'),
  ('0c0a0000-0000-4000-8000-000000000001', 'Analista de RH', '252405')
on conflict do nothing;

-- Depois do primeiro login, conceda o papel de administrador:
--   select private.bootstrap_admin('seu-email@cart.com.br', '0c0a0000-0000-4000-8000-000000000001');
