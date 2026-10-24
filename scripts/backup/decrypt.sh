#!/usr/bin/env bash
# Descriptografa e extrai um backup: scripts/backup/decrypt.sh arquivo.tar.gz.enc [pasta-destino]
# A senha vem de BACKUP_PASSPHRASE (ou é pedida no terminal).
set -euo pipefail
FILE="${1:?informe o arquivo .tar.gz.enc}"
DEST="${2:-.}"
mkdir -p "$DEST"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then PASS=(-pass env:BACKUP_PASSPHRASE); else PASS=(); fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 "${PASS[@]}" -in "$FILE" | tar -C "$DEST" -xzf -
echo "✓ Extraído em $DEST"
