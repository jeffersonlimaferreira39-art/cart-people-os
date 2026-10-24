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
| Onde fica | **Cloudflare R2** (bucket privado, pasta `backups/AAAA/MM/`) e, como segunda cópia, artefato do GitHub Actions por 30 dias |
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
| `R2_ACCOUNT_ID` | Cloudflare → R2 → Account ID (aparece na página do R2) |
| `R2_BUCKET` | Nome do bucket, ex.: `cart-people-os-backups` |
| `R2_ACCESS_KEY_ID` | Token da API do R2 (Object Read & Write, só neste bucket) → Access Key ID |
| `R2_SECRET_ACCESS_KEY` | O mesmo token → Secret Access Key |

### Cloudflare R2 (uma vez)
1. Cloudflare → **R2 Object Storage** → ative o R2 (o plano gratuito inclui 10 GB; a Cloudflare pede um
   meio de pagamento para ativar).
2. **Create bucket**: `cart-people-os-backups`, Location **Automatic** (não há região na América do Sul),
   Storage Class **Standard** (a cota grátis vale só para ela). Deixe **privado**
   (sem domínio público nem acesso r2.dev).
3. **Manage API tokens → Create API token**: permissão *Object Read & Write*, aplicada **só a este bucket**.
   Copie Access Key ID e Secret Access Key (o segredo só aparece uma vez).
4. Retenção (recomendado): no bucket → Settings → **Object lifecycle rules** → apagar objetos com prefixo
   `backups/` após 180 dias.

Depois: Actions → **Backup** → Run workflow, para gerar o primeiro e conferir.

## Baixar e abrir um backup

1. Do R2: Cloudflare → R2 → bucket → `backups/AAAA/MM/` → baixe o `.tar.gz.enc` e o `.sha256` da data.
   Ou pelo terminal: `aws s3 cp s3://<bucket>/backups/AAAA/MM/<arquivo> . --endpoint-url https://<account_id>.r2.cloudflarestorage.com`
   (com as chaves do token). Alternativa: Actions → Backup → execução → Artifacts (últimos 30 dias).
2. `BACKUP_PASSPHRASE='...' bash scripts/backup/decrypt.sh cart-people-os-<data>.tar.gz.enc ./restauracao`
3. Confira a integridade na pasta do download: `sha256sum -c cart-people-os-<data>.sha256` (deve dizer OK).

## Restaurar (projeto Supabase novo ou o mesmo, vazio)

1. Crie o projeto (região São Paulo) e aplique **as migrações** em ordem (SQL Editor ou `psql`).
   Não rode o `seed.sql`: os dados vêm do backup.
2. Carregue os dados (gatilhos de regra/auditoria ficam desligados durante a carga):
   `psql "<SUPABASE_DB_URL do projeto novo>" -v ON_ERROR_STOP=1 -f restauracao/cart-people-os-<data>/data.sql`
3. Arquivos: `SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/backup/storage.mjs restore restauracao/cart-people-os-<data>/storage`
4. Compare as contagens com `row-counts.json`, troque as chaves na Vercel (se o projeto mudou) e
   ajuste URL do site e Redirect URLs no Auth (README, passo 3).

Primeiro backup em produção: 24/10/2026 (GitHub Actions, pg_dump 17, aberto e conferido).
Teste de restauração validado em outubro de 2026: banco novo com migrações + `data.sql`
reproduziu exatamente as contagens de colaboradores, acessos, auditoria, logins, documentos e folha.

## Alternativa paga
No plano Pro do Supabase há backups diários gerenciados (7 dias) e, com o add-on, PITR
(restauração para qualquer minuto). Mesmo assim, manter este backup próprio protege contra perda
do projeto ou da conta.
