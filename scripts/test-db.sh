#!/usr/bin/env bash
# Recria um banco de teste, aplica shim + migrações + seed e roda os testes de RLS.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
DB="${TEST_DB_NAME:-cart_people_os_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in supabase/tests/supabase-shim.sql supabase/migrations/*.sql supabase/seed.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" 2>&1 | grep -v "NOTICE" || true
done
export TEST_DATABASE_URL="postgresql://${PGUSER:-postgres}${PGPASSWORD:+:$PGPASSWORD}@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
[[ "${PGHOST:-}" == /* ]] && export TEST_DATABASE_URL="postgresql://${PGUSER:-postgres}@localhost/$DB?host=$PGHOST&port=${PGPORT:-5432}"
npx vitest run --config vitest.db.config.mts
