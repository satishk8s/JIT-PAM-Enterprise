# NPAMX + Vault DB JIT Production Readiness Runbook

Last updated: 2026-04-02 (IST)

## 1) Executive Summary

This document is the production runbook for NPAMX database JIT access with Vault for user lifecycle and IAM Identity Center for access assignment.

Primary outcomes:

- No hardcoded Vault connection names.
- No hidden post-UI manual steps for normal activation/revoke paths.
- Automatic stale JIT permission-set cleanup.
- Vault config/role drift detection.
- Redshift, MySQL, and PostgreSQL activation + revoke behavior validated with explicit checks.

## 2) Complete Recap (From Beginning to Current Stable Model)

### Phase A: Initial activation failures

- NPAMX requests failed with:
  - `failed to find entry for connection with name: "nonprod-mysql"`
  - `failed to find entry for connection with name: "nonprod-postgres"`
  - `failed to find entry for connection with name: "nonprod-redshift"`
- Root cause: Vault role `db_name` and NPAMX-resolved connection names were not aligned.

### Phase B: Redshift IAM permission-set failures

- `PutInlinePolicyToPermissionSet` repeatedly failed with `Invalid PermissionsPolicy Document`.
- This occurred despite DB user creation succeeding in some attempts, causing partial state.
- Stabilization moved to managed policy/customer-managed policy attachment path for Redshift permission sets.

### Phase C: Cleanup gaps identified

- Force revoke/expiry sometimes left:
  - stale Redshift DB users
  - stale JIT permission sets
  - stale Vault dynamic roles
- Cleanup reliability was improved in backend with retry paths for partial IAM/Vault cleanup.

### Phase D: Operational hardening added

- NPAMX stale JIT cleanup script added:
  - `scripts/cleanup-stale-jit-permission-sets.py`
- Installer for weekly cron added:
  - `scripts/install-weekly-jit-permission-set-cleanup-cron.sh`
- Vault drift checker added:
  - `scripts/check-vault-db-drift.sh`
- Host log cleanup script added:
  - `scripts/cleanup-host-logs.sh`
- Admin API + UI support added to list/delete stale JIT permission sets.

### Phase E: Vault connection/role alignment fixes

- MySQL role `poc-mysql-read` was corrected to use `db_name=poc-mysql-mydb`.
- PostgreSQL role `np-jit-read-pg` was corrected to use `db_name=nonprod-postgres-appdb`.
- Redshift connection stabilized on `nonprod-redshift-dev`.
- Verified Vault can mint + revoke dynamic users for MySQL and PostgreSQL directly from Vault CLI.

## 3) Final Target Architecture (Production)

1. User request approved in NPAMX.
2. NPAMX creates/uses per-request Vault DB role and mints dynamic DB user.
3. NPAMX creates Identity Center permission set and account assignment.
4. NPAMX shows credentials only after activation path reaches ready state.
5. On revoke/expiry:
   - NPAMX revokes Vault lease + deletes request-scoped Vault role.
   - NPAMX removes Identity Center assignment and deletes JIT permission set.
6. Weekly and on-demand stale cleanup catches leftovers if any API eventual consistency or transient failure occurred.

## 4) Mandatory IAM Permissions (Management Account Role)

The assumed role used by NPAMX (`IDC_ASSUME_ROLE_ARN`, currently `PAM-IdentityCenter-Role`) must include all Identity Center operations required by runtime + cleanup scripts.

Required additions beyond baseline:

- `sso:AttachCustomerManagedPolicyReferenceToPermissionSet`
- `sso:DetachCustomerManagedPolicyReferenceFromPermissionSet`
- `sso:ListCustomerManagedPolicyReferencesInPermissionSet`
- `sso:ListAccountsForProvisionedPermissionSet`

Recommended also include:

- `sso:DeleteInlinePolicyFromPermissionSet`

Without these, Redshift permission-set attachment and stale-set inspection/cleanup will fail.

## 5) Redshift Policy Model for Production

Use customer-managed policy attachment for Redshift JIT sets (instead of inline Redshift policy generation).

NPAMX env:

```bash
REDSHIFT_IDC_CUSTOMER_MANAGED_POLICY_NAME=NPAMXRedshiftGetClusterCredentials
REDSHIFT_IDC_CUSTOMER_MANAGED_POLICY_PATH=/
```

Create policy in each workload/member account where Redshift clusters exist.

Example policy (start broad, then tighten by cluster/database as needed):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RedshiftLogin",
      "Effect": "Allow",
      "Action": [
        "redshift:GetClusterCredentials",
        "redshift:DescribeClusters"
      ],
      "Resource": "*"
    }
  ]
}
```

Note: This policy belongs in member/workload accounts, not only management account.

## 6) Vault Production Setup Standard (No Drift)

## 6.1 Permanent DB admin users for Vault

Create once per DB target, then rotate password via standard secret rotation process.

MySQL (RDS) example:

```sql
CREATE USER IF NOT EXISTS 'vault_admin_mysql_<env>'@'%' IDENTIFIED BY '<strong-password>';
GRANT CREATE USER ON *.* TO 'vault_admin_mysql_<env>'@'%';
GRANT SELECT ON `mydb`.* TO 'vault_admin_mysql_<env>'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

PostgreSQL (RDS) example:

```sql
CREATE ROLE vault_admin_postgres_<env> WITH LOGIN PASSWORD '<strong-password>';
ALTER ROLE vault_admin_postgres_<env> WITH CREATEROLE;
```

Important for PostgreSQL: do not grant `rds_iam` to Vault admin role used for password auth in Vault plugin verification path.

Redshift example:

```sql
CREATE USER vault_admin_redshift_<env> PASSWORD '<strong-password>';
ALTER USER vault_admin_redshift_<env> CREATEUSER;
```

## 6.2 Vault `database/config/*` entries

Expected nonprod connection keys (example):

- `poc-mysql-mydb`
- `nonprod-postgres-appdb`
- `nonprod-redshift-dev`

Each config must have:

- valid `connection_url`
- permanent `username` / `password`
- `allowed_roles="*"` unless strict role allow-listing is intentionally enforced

Important:

- Vault `database/config` does not dereference KV paths directly in `username` / `password`.
- If you want DevOps to update credentials in one place only (KV UI), run the KV->database/config sync automation from section 8.2.

## 6.3 Vault role `db_name` must match config key exactly

Examples:

- `poc-mysql-read` -> `db_name=poc-mysql-mydb`
- `np-jit-read-pg` -> `db_name=nonprod-postgres-appdb`

If role points to missing config (example `nonprod-mysql` after config renamed), credential minting fails.

## 6.4 Connectivity + revoke smoke test (run before go-live)

```bash
vault read database/creds/poc-mysql-read
vault write sys/leases/revoke lease_id="<lease_id>"

vault read database/creds/np-jit-read-pg
vault write sys/leases/revoke lease_id="<lease_id>"
```

For Redshift dynamic roles, test through NPAMX flow and then verify revoke removes user.

## 6.5 PostgreSQL Username Prefix Standard (`d-` only)

If PostgreSQL dynamic users are being created with `v-` prefix and you want strict `d-` parity with MySQL, update Vault PostgreSQL connection `username_template` to `d-...`.

Use this exact sequence:

```bash
# 1) Check current value
vault read database/config/nonprod-postgres-appdb

# 2) Rewrite config with d- prefix (same values, only username_template changed)
vault write database/config/nonprod-postgres-appdb \
  plugin_name="postgresql-database-plugin" \
  allowed_roles="*" \
  connection_url="postgresql://{{username}}:{{password}}@database-2.cjqnggjluhbw.ap-south-1.rds.amazonaws.com:5432/postgres?sslmode=require" \
  username="vault_admin_postgres_np" \
  password="StrongTempPassword#123!" \
  max_open_connections=4 \
  max_idle_connections=0 \
  max_connection_lifetime="0s" \
  username_template="d-{{.RoleName}}-{{random 6}}"

# 3) Verify
vault read database/config/nonprod-postgres-appdb
vault read database/creds/np-jit-read-pg
```

Notes:

- Existing `v-...` users already created will not rename automatically.
- New credentials minted after this change will follow `d-...`.
- Apply the same pattern in prod (`database/config/prod-postgres-...`) before cutover.

## 7) NPAMX Environment Standard (Connection Map, No Hardcoding)

Use one map variable per plane. Do not rely on engine-default fallback names.

Nonprod example:

```bash
VAULT_DB_CONNECTION_NAME_MAP_NONPROD={"database-1":"poc-mysql-mydb","database-2":"nonprod-postgres-appdb","redshift1":"nonprod-redshift-dev","mysql:database-1":"poc-mysql-mydb","postgres:database-2":"nonprod-postgres-appdb","redshift:redshift1":"nonprod-redshift-dev"}
```

Prod example (replace values with prod config names):

```bash
VAULT_DB_CONNECTION_NAME_MAP_PROD={"database-1":"prod-mysql-mydb","database-2":"prod-postgres-appdb","redshift1":"prod-redshift-dev","mysql:database-1":"prod-mysql-mydb","postgres:database-2":"prod-postgres-appdb","redshift:redshift1":"prod-redshift-dev"}
```

Identity Center assume-role env (NPAMX host):

```bash
IDC_ASSUME_ROLE_ARN=arn:aws:iam::<management-account-id>:role/PAM-IdentityCenter-Role
IDC_ASSUME_ROLE_SESSION_NAME=npam-idc
```

## 8) Scripts Created and Required in Production

## 8.1 NPAMX host scripts

1. `scripts/cleanup-stale-jit-permission-sets.py`
2. `scripts/install-weekly-jit-permission-set-cleanup-cron.sh`
3. `scripts/cleanup-host-logs.sh`

Install path:

- `/opt/npamx/scripts/cleanup-stale-jit-permission-sets.py`
- `/opt/npamx/scripts/install-weekly-jit-permission-set-cleanup-cron.sh`
- `/opt/npamx/scripts/cleanup-host-logs.sh`

Install weekly stale JIT cleanup cron:

```bash
ASSUME_ROLE_ARN="arn:aws:iam::<management-account-id>:role/PAM-IdentityCenter-Role" \
REGION="ap-south-1" \
CRON_TZ_VALUE="Asia/Kolkata" \
CRON_SCHEDULE="0 6 * * 5" \
/opt/npamx/scripts/install-weekly-jit-permission-set-cleanup-cron.sh
```

Dry run:

```bash
python3 /opt/npamx/scripts/cleanup-stale-jit-permission-sets.py \
  --region ap-south-1 \
  --assume-role-arn arn:aws:iam::<management-account-id>:role/PAM-IdentityCenter-Role \
  --dry-run
```

## 8.2 Vault host script

1. `scripts/check-vault-db-drift.sh`
2. `scripts/sync-vault-db-config-from-kv.py`
3. `scripts/install-vault-db-config-kv-sync-cron.sh`
4. `scripts/vault-db-admin-sync.example.json`

Install path:

- `/opt/npamx/scripts/check-vault-db-drift.sh`
- `/opt/npamx/scripts/sync-vault-db-config-from-kv.py`
- `/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh`
- `/etc/npamx/vault-db-admin-sync.json`

Run:

```bash
VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh
```

Weekly cron example:

```bash
(crontab -l 2>/dev/null; echo 'CRON_TZ=Asia/Kolkata'; echo '30 5 * * 5 VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh >> /var/log/vault-db-drift.log 2>&1') | crontab -
```

KV->database/config sync setup (single source of truth = KV):

```bash
mkdir -p /opt/npamx/scripts /etc/npamx
cp scripts/sync-vault-db-config-from-kv.py /opt/npamx/scripts/
cp scripts/install-vault-db-config-kv-sync-cron.sh /opt/npamx/scripts/
cp scripts/vault-db-admin-sync.example.json /etc/npamx/vault-db-admin-sync.json
chmod 755 /opt/npamx/scripts/sync-vault-db-config-from-kv.py /opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh
```

Recommended scalable pattern (no per-connection hardcoding):

- Enable `auto_discovery.enabled=true`.
- Store one KV secret per connection using path convention:
  - `kv/npamx/db-admin/connections/<connection_name>`
- Each KV secret must contain keys: `username`, `password`.
- Sync job discovers all `database/config/*` connections and pulls matching KV secret automatically.

You only need `entries[]` for special overrides (shared secret across many connections, custom path, etc.).

Dry run:

```bash
python3 /opt/npamx/scripts/sync-vault-db-config-from-kv.py \
  --mapping-file /etc/npamx/vault-db-admin-sync.json \
  --database-mount database \
  --dry-run
```

Apply once:

```bash
python3 /opt/npamx/scripts/sync-vault-db-config-from-kv.py \
  --mapping-file /etc/npamx/vault-db-admin-sync.json \
  --database-mount database
```

Install recurring sync cron (every 10 minutes IST by default):

```bash
SCRIPT_PATH="/opt/npamx/scripts/sync-vault-db-config-from-kv.py" \
MAPPING_FILE="/etc/npamx/vault-db-admin-sync.json" \
DATABASE_MOUNT="database" \
CRON_TZ_VALUE="Asia/Kolkata" \
CRON_SCHEDULE="*/10 * * * *" \
/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh
```

Recommended: use a dedicated Vault token for cron (not root token).

```bash
cat >/tmp/npamx-kv-db-sync.hcl <<'EOF'
path "kv/data/npamx/db-admin/*" {
  capabilities = ["read"]
}
path "kv/metadata/npamx/db-admin/*" {
  capabilities = ["read", "list"]
}
path "database/config/*" {
  capabilities = ["read", "create", "update"]
}
EOF

vault policy write npamx-kv-db-sync /tmp/npamx-kv-db-sync.hcl
vault token create -policy=npamx-kv-db-sync -period=24h -orphan
```

Set the returned token for cron user environment (`VAULT_TOKEN`) via your standard secure mechanism.

## 9) Mandatory Weekly Cron Schedule (IST)

- Friday 05:30 IST (Vault host): drift check (`check-vault-db-drift.sh`)
- Every 10 minutes (Vault host): KV->database/config sync (`sync-vault-db-config-from-kv.py`)

## 10) Vault Audit Log Archival to S3

Vault control-plane audit data must also be archived outside the cluster for investigation and retention. Use the same central bucket `npamx-logs`, but keep Vault data under separate prefixes from NPAMX application logs.

Archive layout:

- nonprod Vault: `s3://npamx-logs/nonprod-vault/audit/`
- prod Vault: `s3://npamx-logs/prod-vault/audit/`

What this captures:

- UI and API login attempts
- auth method usage (`oidc`, `aws`, `userpass`, `approle`)
- access to Vault paths
- `database/config/*` changes
- `database/roles/*` changes
- `database/creds/*` reads and lease issuance
- revoke activity through `sys/leases/*`

Verify the active audit file path first:

```bash
vault audit list -detailed
```

Expected:

- `file_path=/var/log/vault_audit.log`

Install the rotated-file upload script:

```bash
mkdir -p /opt/npamx/scripts

cat >/opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-prod-vault}"
BUCKET="${2:-npamx-logs}"
LOG_FILE="${3:-/var/log/vault_audit.log}"
PREFIX="${4:-audit}"

HOST="$(hostname -s)"
LOG_DIR="$(dirname "$LOG_FILE")"
BASE_NAME="$(basename "$LOG_FILE")"
shopt -s nullglob

for f in "$LOG_DIR"/"$BASE_NAME"-* "$LOG_DIR"/"$BASE_NAME".*; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in
    "$BASE_NAME") continue ;;
  esac
  base="$(basename "$f")"
  day_path="$(date -u -r "$f" +%Y/%m/%d 2>/dev/null || date -u +%Y/%m/%d)"
  key="${ENV_NAME}/${PREFIX}/${day_path}/${HOST}_${base}"
  if aws s3api head-object --bucket "$BUCKET" --key "$key" >/dev/null 2>&1; then
    echo "[SKIP] already uploaded: s3://${BUCKET}/${key}"
    continue
  fi
  aws s3 cp "$f" "s3://${BUCKET}/${key}"
  echo "[OK] uploaded: s3://${BUCKET}/${key}"
done
EOF

chmod 755 /opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh
```

Configure weekly rotation and upload:

Nonprod:

```bash
cat >/etc/logrotate.d/vault-audit <<'EOF'
/var/log/vault_audit.log {
    weekly
    rotate 8
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    sharedscripts
    postrotate
        /opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh nonprod-vault npamx-logs /var/log/vault_audit.log audit >> /var/log/vault-audit-s3-sync.log 2>&1 || true
    endscript
}
EOF
```

Prod:

```bash
cat >/etc/logrotate.d/vault-audit <<'EOF'
/var/log/vault_audit.log {
    weekly
    rotate 8
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    sharedscripts
    postrotate
        /opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh prod-vault npamx-logs /var/log/vault_audit.log audit >> /var/log/vault-audit-s3-sync.log 2>&1 || true
    endscript
}
EOF
```

Run one validation cycle:

```bash
sudo logrotate -f /etc/logrotate.d/vault-audit
ls -lh /var/log/vault_audit.log*
tail -n 50 /var/log/vault-audit-s3-sync.log
aws s3 ls s3://npamx-logs/nonprod-vault/audit/ --recursive | tail -n 20
aws s3 ls s3://npamx-logs/prod-vault/audit/ --recursive | tail -n 20
```

Expected uploaded object pattern:

- `nonprod-vault/audit/YYYY/MM/DD/<hostname>_vault_audit.log.1`
- `prod-vault/audit/YYYY/MM/DD/<hostname>_vault_audit.log.1`

Important operations notes:

- upload rotated files only; do not repeatedly copy the live file
- use S3 lifecycle for 365-day retention
- reduce `rotate 8` if you want fewer local copies
- change `weekly` to `daily` if your compliance or troubleshooting workflow needs faster off-host upload
- Friday 06:00 IST (NPAMX host): stale JIT permission-set cleanup
- Every 30 minutes (NPAMX host): host/container log cleanup

## 10) Admin Emergency Controls (NPAMX)

NPAMX admin now supports stale JIT permission set visibility and deletion:

- `GET /api/admin/identity-center/permission-sets/jit-stale`
- `POST /api/admin/identity-center/permission-sets/jit-stale/delete`

Use this for emergency/manual cleanup if background cleanup retries miss a case.

Admin UI location:

- `Admin -> AWS Identity Center -> Stale JIT Permission Sets`

## 10.1) Vault DB Connection Push UI Modes (Important)

NPAMX now has two distinct actions in `Admin -> Integrations -> Vault DB`:

- `Push to Vault`:
  - Full upsert flow for `database/config/<connection_name>`.
  - Requires KV secret reference (recommended) or inline DB admin username/password.
  - Use when creating/updating full connection config.

- `Apply Allowed Roles Only`:
  - Updates only `allowed_roles` on an existing Vault connection.
  - Does **not** require KV/admin DB credentials.
  - Use for fast/safe role-allowlist updates such as `allowed_roles=*`.

Critical rule:

- `Vault Connection Name` must be the actual Vault config key (for example `nonprod-postgres-appdb`), not necessarily the instance identifier (for example `database-2`).

## 11) Validation Checklist for Prod Cutover

Run one fresh request each: MySQL, PostgreSQL, Redshift.

After approval/activation, verify:

1. DB user exists.
2. User can connect with expected method.
3. NPAMX request status reaches `ACTIVE` and activation progress shows all steps done.

Then force revoke and verify:

1. DB user removed.
2. Assignment removed.
3. JIT permission set removed (or appears in stale list and can be deleted immediately).

SQL checks:

MySQL:

```sql
SELECT user, host FROM mysql.user WHERE user LIKE 'd-%' ORDER BY user, host;
```

PostgreSQL:

```sql
SELECT usename FROM pg_user WHERE usename LIKE 'd-%' ORDER BY usename;
```

Redshift:

```sql
SELECT usename FROM pg_user WHERE usename LIKE 'dwh-%' ORDER BY usename;
```

## 12) Known Failure Signatures and Exact Fix

- `failed to find entry for connection with name ...`
  - Fix: set `VAULT_DB_CONNECTION_NAME_MAP_<PLANE>` and ensure role `db_name` equals existing `database/config/*`.

- `"is not an allowed role"`
  - Fix: verify target `database/config/<name>` has `allowed_roles=*` or includes role.

- `Invalid PermissionsPolicy Document` on Redshift inline policy
  - Fix: use customer-managed policy attachment path for Redshift.

- `AccessDeniedException` for `AttachCustomerManagedPolicyReferenceToPermissionSet`
  - Fix: add `sso:AttachCustomerManagedPolicyReferenceToPermissionSet` on assumed management role.

- `AccessDeniedException` for `ListAccountsForProvisionedPermissionSet`
  - Fix: add `sso:ListAccountsForProvisionedPermissionSet` on assumed management role.

- `PAM authentication failed for user vault_admin_postgres_<env>`
  - Fix: correct Postgres role/password setup and remove `rds_iam` from Vault admin role used for password auth.

## 13) Production Guardrails (Do/Do Not)

Do:

- Keep one permanent Vault admin user per engine/DB target.
- Keep Vault config names stable and map NPAMX instance IDs explicitly.
- Run drift check and stale cleanup every week.
- Treat stale JIT permission sets as a bug signal and investigate root cause.

Do not:

- Do not hardcode fallback connection names in operational steps.
- Do not change Vault `database/config/*` names without updating NPAMX connection maps and role `db_name`.
- Do not rely only on UI success message; always validate DB user creation and revoke behavior in cutover testing.

## 14) Go-Live Runbook (Minimal Sequence)

1. Prepare management role IAM permissions (Section 4).
2. Prepare member account Redshift policy (Section 5).
3. Create/verify permanent Vault DB admin users (Section 6.1).
4. Create/verify Vault `database/config/*` and role `db_name` alignment (Section 6.2/6.3).
5. Apply NPAMX env map and Identity Center env on host, deploy image, verify env in active container.
6. Install NPAMX scripts + cron (Section 8.1, 9).
7. Install Vault drift script + cron (Section 8.2, 9).
8. Execute 3-engine validation + revoke tests (Section 11).
9. Freeze baseline and hand over operations with this document.

## 15) Final Vault Readiness Gate (Run Before Fresh Test Requests)

Run on Vault host and proceed only if all checks pass.

```bash
# A) Inventory and drift
vault list database/config
vault list database/roles
VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh

# B) Verify expected configs exist and are readable
vault read database/config/poc-mysql-mydb
vault read database/config/nonprod-postgres-appdb
vault read database/config/nonprod-redshift-dev

# B2) Verify allowed_roles on every connection (must be "*" unless intentionally restricted)
python3 - <<'PY'
import json, subprocess
conns=json.loads(subprocess.check_output(["vault","list","-format=json","database/config"],text=True))
for c in conns:
    n=str(c).strip().rstrip("/")
    d=json.loads(subprocess.check_output(["vault","read","-format=json",f"database/config/{n}"],text=True)).get("data",{})
    print(f"{n} -> allowed_roles={d.get('allowed_roles')}")
PY

# C) Verify expected roles point to correct db_name
vault read database/roles/poc-mysql-read
vault read database/roles/np-jit-read-pg
vault read database/roles/np-jit-read

# D) Mint and revoke smoke creds directly from Vault
vault read database/creds/poc-mysql-read
vault read database/creds/np-jit-read-pg

# E) Optional: immediate revoke test (replace with actual lease_id values from step D)
vault write sys/leases/revoke lease_id="<mysql_lease_id>"
vault write sys/leases/revoke lease_id="<postgres_lease_id>"
```

Pass criteria:

- Drift checker returns `[OK] No Vault role/config drift detected.`
- No `failed to find entry for connection with name ...` errors.
- No `"is not an allowed role"` errors.
- Both MySQL and PostgreSQL creds can be minted and revoked successfully.

## 16) Non-Prod Proven Command Pack (Reference Baseline Before Prod)

Use this as the exact proven baseline from non-prod before applying prod values.

### 16.1 Vault inventory + drift + allowed_roles verification

```bash
vault list database/config
vault list database/roles
VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh

python3 - <<'PY'
import json, subprocess
conns=json.loads(subprocess.check_output(["vault","list","-format=json","database/config"],text=True))
for c in conns:
    n=str(c).strip().rstrip("/")
    d=json.loads(subprocess.check_output(["vault","read","-format=json",f"database/config/{n}"],text=True)).get("data",{})
    print(f"{n} -> allowed_roles={d.get('allowed_roles')}")
PY
```

### 16.2 Force `allowed_roles=*` quickly (Vault CLI fallback)

```bash
# Example: MySQL
vault write database/config/poc-mysql-mydb allowed_roles="*"

# Example: PostgreSQL
vault write database/config/nonprod-postgres-appdb allowed_roles="*"
```

### 16.3 Vault mint/revoke smoke checks

```bash
vault read database/creds/poc-mysql-read
vault read database/creds/np-jit-read-pg

# Replace with actual lease ids returned above
vault write sys/leases/revoke lease_id="<mysql_lease_id>"
vault write sys/leases/revoke lease_id="<postgres_lease_id>"
```

### 16.4 NPAMX host script checks

```bash
python3 /opt/npamx/scripts/cleanup-stale-jit-permission-sets.py \
  --region ap-south-1 \
  --assume-role-arn arn:aws:iam::<management-account-id>:role/PAM-IdentityCenter-Role \
  --dry-run
```

### 16.5 Weekly cron installs (non-prod validated schedule)

NPAMX host:

```bash
ASSUME_ROLE_ARN="arn:aws:iam::<management-account-id>:role/PAM-IdentityCenter-Role" \
REGION="ap-south-1" \
CRON_TZ_VALUE="Asia/Kolkata" \
CRON_SCHEDULE="0 6 * * 5" \
/opt/npamx/scripts/install-weekly-jit-permission-set-cleanup-cron.sh
```

Vault host:

```bash
(crontab -l 2>/dev/null; echo 'CRON_TZ=Asia/Kolkata'; echo '30 5 * * 5 VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh >> /var/log/vault-db-drift.log 2>&1') | crontab -

SCRIPT_PATH="/opt/npamx/scripts/sync-vault-db-config-from-kv.py" \
MAPPING_FILE="/etc/npamx/vault-db-admin-sync.json" \
DATABASE_MOUNT="database" \
CRON_TZ_VALUE="Asia/Kolkata" \
CRON_SCHEDULE="*/10 * * * *" \
/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh
```

### 16.6 Scripts to carry to production

NPAMX host scripts:

- `/opt/npamx/scripts/cleanup-stale-jit-permission-sets.py`
- `/opt/npamx/scripts/install-weekly-jit-permission-set-cleanup-cron.sh`
- `/opt/npamx/scripts/cleanup-host-logs.sh`

Vault host scripts:

- `/opt/npamx/scripts/check-vault-db-drift.sh`
- `/opt/npamx/scripts/sync-vault-db-config-from-kv.py`
- `/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh`
- `/etc/npamx/vault-db-admin-sync.json`
