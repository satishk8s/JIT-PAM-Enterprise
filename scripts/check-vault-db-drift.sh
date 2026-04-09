#!/usr/bin/env bash
set -euo pipefail

# Detect Vault DB role/config drift:
# - role db_name points to missing database/config entry

MOUNT="${VAULT_DB_MOUNT:-database}"

echo "[INFO] Checking Vault DB drift on mount: ${MOUNT}"

mapfile -t CONFIGS < <(vault list -format=json "${MOUNT}/config" 2>/dev/null | python3 -c 'import json,sys; data=json.load(sys.stdin) if not sys.stdin.isatty() else []; [print(x) for x in (data or [])]' || true)
mapfile -t ROLES < <(vault list -format=json "${MOUNT}/roles" 2>/dev/null | python3 -c 'import json,sys; data=json.load(sys.stdin) if not sys.stdin.isatty() else []; [print(x) for x in (data or [])]' || true)

if [[ ${#CONFIGS[@]} -eq 0 ]]; then
  echo "[WARN] No ${MOUNT}/config entries found."
fi

if [[ ${#ROLES[@]} -eq 0 ]]; then
  echo "[INFO] No ${MOUNT}/roles entries found."
  exit 0
fi

declare -A CONFIG_SET=()
for c in "${CONFIGS[@]}"; do
  c_trimmed="${c%/}"
  [[ -n "$c_trimmed" ]] && CONFIG_SET["$c_trimmed"]=1
done

drift_count=0
for role in "${ROLES[@]}"; do
  role_trimmed="${role%/}"
  [[ -z "$role_trimmed" ]] && continue
  db_name="$(vault read -format=json "${MOUNT}/roles/${role_trimmed}" 2>/dev/null | python3 -c 'import json,sys; obj=json.load(sys.stdin); print((obj.get("data") or {}).get("db_name",""))' || true)"
  db_name="${db_name%/}"
  if [[ -z "$db_name" ]]; then
    echo "[DRIFT] role=${role_trimmed} has empty db_name"
    drift_count=$((drift_count + 1))
    continue
  fi
  if [[ -z "${CONFIG_SET[$db_name]:-}" ]]; then
    echo "[DRIFT] role=${role_trimmed} db_name=${db_name} missing in ${MOUNT}/config"
    drift_count=$((drift_count + 1))
  fi
done

if [[ $drift_count -gt 0 ]]; then
  echo "[FAIL] Drift detected: ${drift_count} issue(s)."
  exit 1
fi

echo "[OK] No Vault role/config drift detected."
