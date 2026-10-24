#!/usr/bin/env bash
# Backup completo do C'Art People OS: banco (dados de public, private e logins)
# + arquivos do Storage, compactados e CRIPTOGRAFADOS (AES-256, chave em BACKUP_PASSPHRASE).
#
# Variáveis: SUPABASE_DB_URL (pooler em modo sessão, porta 5432), SUPABASE_URL,
#            SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE. Opcional: OUT_DIR (padrão ./backup-out).
# Requer pg_dump na mesma versão maior do servidor (17) ou mais nova.
set -euo pipefail
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL}" "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"

STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
OUT_DIR="${OUT_DIR:-./backup-out}"
WORK="$(mktemp -d)"
DEST="$WORK/cart-people-os-$STAMP"
mkdir -p "$DEST" "$OUT_DIR"
trap 'rm -rf "$WORK"' EXIT

echo "→ Estrutura (referência; a restauração usa as migrações do repositório)"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges \
  --schema=public --schema=private > "$DEST/schema.sql"

echo "→ Dados (public, private e contas de acesso do Auth)"
{
  echo "-- Restaurar com: psql \"\$DB_URL\" -v ON_ERROR_STOP=1 -f data.sql"
  echo "-- Gatilhos de regra e auditoria ficam desligados durante a carga."
  echo "SET session_replication_role = replica;"
  # Duas chamadas: com --table, o pg_dump ignora --schema.
  pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges --table=auth.users --table=auth.identities
  pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges --schema=public --schema=private
  echo "SET session_replication_role = origin;"
} > "$DEST/data.sql"

if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "→ Arquivos do Storage"
  node "$(dirname "$0")/storage.mjs" backup "$DEST/storage"
else
  echo "→ Storage ignorado (SUPABASE_URL/SUPABASE_SECRET_KEY ausentes)"
fi

# Contagem de linhas por tabela, para conferir depois da restauração.
psql "$SUPABASE_DB_URL" -At -c "
  select json_object_agg(relname, n_live_tup) from pg_stat_user_tables where schemaname = 'public'" > "$DEST/row-counts.json" || true
cat > "$DEST/manifest.json" <<JSON
{ "created_at": "$STAMP", "git_sha": "${GITHUB_SHA:-local}", "pg_dump": "$(pg_dump --version | sed 's/"//g')" }
JSON

echo "→ Compactando e criptografando"
tar -C "$WORK" -czf - "cart-people-os-$STAMP" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
      -out "$OUT_DIR/cart-people-os-$STAMP.tar.gz.enc"
sha256sum "$OUT_DIR/cart-people-os-$STAMP.tar.gz.enc" | tee "$OUT_DIR/cart-people-os-$STAMP.sha256"
echo "✓ Backup pronto: $OUT_DIR/cart-people-os-$STAMP.tar.gz.enc"
