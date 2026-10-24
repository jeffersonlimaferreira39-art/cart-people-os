# Backup e restauração

O plano gratuito do Supabase não guarda backups que possam ser baixados (e não tem PITR).
Por isso o repositório tem um **backup próprio**, diário e criptografado:

| O quê | Como |
| --- | --- |
| Dados do banco | `public` e `private` (todas as tabelas do sistema) + contas de acesso (`auth.users`, `auth.identities`) |
| Estrutura | `schema.sql` para referência; a restauração usa as migrações de `supabase/migrations/` |
| Arquivos | Buckets `employee-documents` e `org-documents` |
| Conferência | `row-counts.json` (linhas por tabela) e `manifest.json` |
| Proteção | AES-256 (`openssl -pbkdf2`, 200 mil iterações) com a senha `BACKUP_PASSPHRASE` |
| Onde fica | Artefato do GitHub Actions, 30 dias, no repositório privado |
| Quando | Todo dia às 02:17 (horário de Brasília) e sob demanda |

> O backup contém dados pessoais e sensíveis (LGPD). Sem a senha ele é ilegível; guarde a senha
> num cofre de senhas da empresa, **fora** do GitHub, e restrinja quem pode baixar artefatos.

## Configurar (uma vez)

GitHub → repositório → Settings → Secrets and variables → Actions → **New repository secret**:

| Segredo | Valor |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** (porta 5432), com a senha do banco: `postgresql://postgres.<ref>:<senha>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret (`sb_secret_...`) |
| `BACKUP_PASSPHRASE` | Senha longa gerada para o backup (guarde no cofre) |

Depois: Actions → **Backup** → Run workflow, para gerar o primeiro e conferir.

## Baixar e abrir um backup

1. Actions → Backup → execução desejada → Artifacts → baixe `backup-<id>.zip` e descompacte.
2. `BACKUP_PASSPHRASE='...' bash scripts/backup/decrypt.sh cart-people-os-<data>.tar.gz.enc ./restauracao`
3. Confira `sha256sum` com o arquivo `.sha256` que veio junto.

## Restaurar (projeto Supabase novo ou o mesmo, vazio)

1. Crie o projeto (região São Paulo) e aplique **as migrações** em ordem (SQL Editor ou `psql`).
   Não rode o `seed.sql`: os dados vêm do backup.
2. Carregue os dados (gatilhos de regra/auditoria ficam desligados durante a carga):
   `psql "<SUPABASE_DB_URL do projeto novo>" -v ON_ERROR_STOP=1 -f restauracao/cart-people-os-<data>/data.sql`
3. Arquivos: `SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/backup/storage.mjs restore restauracao/cart-people-os-<data>/storage`
4. Compare as contagens com `row-counts.json`, troque as chaves na Vercel (se o projeto mudou) e
   ajuste URL do site e Redirect URLs no Auth (README, passo 3).

Teste de restauração validado em outubro de 2026: banco novo com migrações + `data.sql`
reproduziu exatamente as contagens de colaboradores, acessos, auditoria, logins, documentos e folha.

## Alternativa paga
No plano Pro do Supabase há backups diários gerenciados (7 dias) e, com o add-on, PITR
(restauração para qualquer minuto). Mesmo assim, manter este backup próprio protege contra perda
do projeto ou da conta.
