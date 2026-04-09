#!/usr/bin/env bash
set -euo pipefail

# Installs a weekly cron entry on the NPAMX host to prune stale JIT permission sets.
# Default schedule: Friday 06:00 Asia/Kolkata.

SCRIPT_PATH="${SCRIPT_PATH:-/opt/npamx/scripts/cleanup-stale-jit-permission-sets.py}"
LOG_FILE="${LOG_FILE:-/var/log/npamx/jit-permission-set-cleanup.log}"
CRON_TZ_VALUE="${CRON_TZ_VALUE:-Asia/Kolkata}"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 6 * * 5}"
REGION="${REGION:-ap-south-1}"
ASSUME_ROLE_ARN="${ASSUME_ROLE_ARN:-${IDC_ASSUME_ROLE_ARN:-}}"

mkdir -p "$(dirname "$LOG_FILE")"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Script not found at $SCRIPT_PATH"
  echo "Copy scripts/cleanup-stale-jit-permission-sets.py to $SCRIPT_PATH first."
  exit 1
fi

chmod 755 "$SCRIPT_PATH"

EXTRA_ARGS=""
if [[ -n "$ASSUME_ROLE_ARN" ]]; then
  EXTRA_ARGS=" --assume-role-arn ${ASSUME_ROLE_ARN}"
fi

CRON_BLOCK=$(cat <<EOF
# NPAMX weekly stale JIT permission-set cleanup
CRON_TZ=${CRON_TZ_VALUE}
${CRON_SCHEDULE} /usr/bin/env python3 ${SCRIPT_PATH} --region ${REGION}${EXTRA_ARGS} >> ${LOG_FILE} 2>&1
EOF
)

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "cleanup-stale-jit-permission-sets.py" > "$TMP_CRON" || true
printf "\n%s\n" "$CRON_BLOCK" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "Installed weekly cron:"
echo "$CRON_BLOCK"
