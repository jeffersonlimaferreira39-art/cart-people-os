# ADR 0001 — Arquitetura base

**Status:** aceita (outubro de 2026)

## Decisões
1. **Autorização no banco (RLS)**, não na aplicação. A interface só esconde o que não se pode
   usar; a garantia é a política. Motivo: um único ponto de verdade, testável em SQL.
2. **Dados sensíveis em tabela própria** (`employee_sensitive`) com política mais restrita.
3. **Regras de fluxo em triggers** (ausências, movimentações), para valerem para qualquer cliente.
4. **Integrações por adaptador** (ponto e folha). O processador oficial da folha continua externo.
5. **Cache Components**: telas com shell estático e dados por requisição em `<Suspense>`;
   `connection()` antes do cliente Supabase porque o Auth lê o relógio ao carregar a sessão.
6. **Uploads por Server Action até 4 MB** (limite da Vercel). Acima disso, upload assinado direto
   ao Storage (pendente).

## Consequências
Novos módulos precisam de migração + política + teste de isolamento antes da tela.
