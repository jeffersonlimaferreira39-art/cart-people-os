# C'Art People OS

Plataforma de RH + Departamento Pessoal da C'Art Ambientações: cadastro de colaboradores, férias e
ausências, movimentações do DP com envio à folha, ponto importado, painel e análises com gráficos,
relatórios em Excel/CSV/PDF, documentos de colaboradores, RH e DP, prévia da folha (VT, VA/VR, benefícios, descontos, dependentes,
INSS, IRRF, FGTS) e assistente de IA.
Multiunidade, com controle de acesso no banco (RLS), auditoria e cuidados de LGPD.

> O People OS **não** calcula folha oficial nem transmite ao eSocial. Ele organiza dados, fluxos e
> aprovações e entrega arquivos ao processador oficial (sistema de folha ou escritório contábil).

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Supabase
(Auth, Postgres, Storage) · Zod · Vitest · Vercel · GitHub Actions.

## Estrutura

```
src/app/(app)/        telas autenticadas (painel, colaboradores, ausencias, dp, ponto, ...)
src/app/login/        login por senha ou link por e-mail
src/lib/auth/         sessão, papéis e unidade em foco (viewer)
src/lib/data/         consultas ao Supabase (sempre com a sessão do usuário)
src/lib/domain/       regras puras: CLT de férias, CPF/PIS, CSV, movimentações, papéis, indicadores
src/lib/reports/      catálogo e montagem de relatórios (Excel, CSV, PDF) + registro de exportação
src/components/charts/ gráficos SVG (linha, colunas, barras) com tooltip e tabela equivalente
src/lib/integrations/ adaptadores de ponto e de folha
src/lib/ai/           assistente e ferramentas somente leitura
supabase/migrations/  esquema, RLS, regras de fluxo e auditoria (fonte da verdade)
supabase/tests/       testes de isolamento RLS contra Postgres real
.claude/skills/       skill de engenharia do projeto + especificação completa
docs/                 decisões de arquitetura e checklist de homologação
```

## Colocar no ar

### 1. Supabase

1. Crie um projeto (região São Paulo).
2. Aplique as migrações:
   ```bash
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   ```
   Sem a CLI: cole os arquivos de `supabase/migrations/` em ordem no SQL Editor.
3. Crie a organização e a primeira unidade no SQL Editor (ou rode `supabase/seed.sql`).
4. **Authentication → Sign In / Providers**: desative *Allow new users to sign up*.
5. **Authentication → URL Configuration**: *Site URL* = endereço da Vercel; em *Redirect URLs*
   adicione `https://SEU-DOMINIO/auth/callback`.
6. **Authentication → Email Templates** (Invite user e Magic Link): troque o link por
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite` (no Magic Link use `type=email`).
7. Convide-se em **Authentication → Users → Invite user**, entre pelo link do e-mail e então rode:
   ```sql
   select private.bootstrap_admin('seu-email@cart.com.br', '<id da organização>');
   ```
   Daí em diante, conceda acessos pela tela **Configurações**.

### 2. Vercel

Importe o repositório do GitHub e defina as variáveis de `.env.example`
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_SITE_URL` e, para o assistente, `ANTHROPIC_API_KEY`).

### 3. Desenvolvimento local

```bash
cp .env.example .env.local   # preencha
npm install
npm run dev
```

## Verificação

```bash
npm run verify    # tipos, lint e testes de domínio
npm run test:db   # migrações + 64 testes de isolamento RLS (precisa de Postgres; PGHOST/PGPORT/PGUSER)
npm run build
```

O CI (`.github/workflows/ci.yml`) roda tudo isso a cada push e pull request.

## Backup

Backup diário criptografado do banco e dos arquivos pelo GitHub Actions — configuração e
restauração em [`docs/BACKUP.md`](docs/BACKUP.md).

## Segurança em resumo

- RLS em todas as tabelas; gestor só vê a própria equipe; unidade A não vê unidade B.
- Dados sensíveis (CPF, salário, banco, endereço) em tabela separada, só RH/DP/admin e o titular.
- Ninguém aprova a própria ausência nem a movimentação que cadastrou.
- Auditoria automática de toda escrita; em dados sensíveis registra só os campos alterados.
- Sem cadastro aberto; chave secreta só no servidor; cabeçalhos de segurança; CSV sem fórmulas.

Detalhes: `.claude/skills/cart-people-os/references/PRODUCT_SPEC.md`.
Antes de usar com dados reais: `docs/HOMOLOGACAO.md`.
