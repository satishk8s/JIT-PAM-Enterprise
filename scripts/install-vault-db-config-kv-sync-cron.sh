#!/usr/bin/env bash
set -euo pipefail

# Installs a recurring cron job on the Vault host:
# KV (source of truth) -> Vault database/config sync.

SCRIPT_PATH="${SCRIPT_PATH:-/opt/npamx/scripts/sync-vault-db-config-from-kv.py}"
MAPPING_FILE="${MAPPING_FILE:-/etc/npamx/vault-db-admin-sync.json}"
LOG_FILE="${LOG_FILE:-/var/log/vault-db-config-kv-sync.log}"
CRON_TZ_VALUE="${CRON_TZ_VALUE:-Asia/Kolkata}"
CRON_SCHEDULE="${CRON_SCHEDULE:-*/10 * * * *}"
DATABASE_MOUNT="${DATABASE_MOUNT:-database}"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Script not found at $SCRIPT_PATH"
  echo "Copy scripts/sync-vault-db-config-from-kv.py to $SCRIPT_PATH first."
  exit 1
fi

if [[ ! -f "$MAPPING_FILE" ]]; then
  echo "Mapping file not found at $MAPPING_FILE"
  echo "Create it from scripts/vault-db-admin-sync.example.json first."
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"
chmod 755 "$SCRIPT_PATH"

CRON_BLOCK=$(cat <<EOF
# NPAMX Vault DB config sync (KV -> database/config)
CRON_TZ=${CRON_TZ_VALUE}
${CRON_SCHEDULE} /usr/bin/env python3 ${SCRIPT_PATH} --mapping-file ${MAPPING_FILE} --database-mount ${DATABASE_MOUNT} >> ${LOG_FILE} 2>&1
EOF
)

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "sync-vault-db-config-from-kv.py" > "$TMP_CRON" || true
printf "\n%s\n" "$CRON_BLOCK" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "Installed cron:"
echo "$CRON_BLOCK"
