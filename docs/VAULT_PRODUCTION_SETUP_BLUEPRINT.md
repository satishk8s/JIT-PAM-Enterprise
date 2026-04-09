# Vault Production Setup Blueprint (High-Level)

Last updated: 2026-04-02 (IST)

This is a broad-level, production-oriented setup blueprint based on the non-prod path that was already validated.

Use this with:

- `docs/VAULT_RAFT_SETUP.md` for full Raft/TLS deep steps
- `docs/PROD_VAULT_NPAMX_DB_JIT_RUNBOOK.md` for NPAMX DB JIT operations

## 1) Create Raft Cluster Instances

Target baseline:

- 3 Vault EC2 instances in private subnets (same AMI and same Vault version)
- Security group allows:
  - `8200` (Vault API/UI) node-to-node and from approved admin/jump hosts
  - `8201` (cluster) node-to-node only
- One IAM role for Vault nodes with KMS permissions for auto-unseal

Node prep (each node):

```bash
sudo apt update
sudo apt install -y vault
sudo mkdir -p /etc/vault.d /opt/vault/data /opt/vault/tls
sudo chown -R vault:vault /opt/vault/data
sudo chmod 750 /opt/vault/data
```

## 2) Connect Instances With TLS Keys/Certs

Generate one internal CA, then one server cert per node with node IP/DNS SAN.

High-level OpenSSL flow (run on secure admin host):

```bash
openssl genrsa -out vault-ca.key 4096
openssl req -x509 -new -nodes -key vault-ca.key -sha256 -days 3650 -out vault-ca.pem -subj "/CN=Vault-Internal-CA"
```

For each node, generate key/csr/cert signed by `vault-ca.pem`.

Copy to each node:

- `/opt/vault/tls/vault-key.pem` (node private key)
- `/opt/vault/tls/vault-cert.pem` (node cert + CA chain)
- `/opt/vault/tls/vault-ca.pem` (CA cert)

Permissions:

```bash
sudo chown root:vault /opt/vault/tls/vault-key.pem
sudo chown root:root /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
sudo chmod 640 /opt/vault/tls/vault-key.pem
sudo chmod 644 /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
```

## 3) Set Up Vault Cluster

Create `/etc/vault.d/vault.hcl` on each node with:

- `storage "raft"` and unique `node_id`
- `listener "tcp"` with TLS cert/key paths
- KMS auto-unseal stanza
- proper `api_addr` and `cluster_addr`

Start service:

```bash
sudo systemctl enable vault
sudo systemctl restart vault
sudo systemctl status vault --no-pager
```

Initialize only on node 1:

```bash
export VAULT_ADDR="https://<node1-ip>:8200"
export VAULT_CACERT="/opt/vault/tls/vault-ca.pem"
vault status
vault operator init
```

Join node 2 and node 3:

```bash
export VAULT_ADDR="https://<node2-or-node3-ip>:8200"
export VAULT_CACERT="/opt/vault/tls/vault-ca.pem"
vault operator raft join \
  -leader-ca-cert="$(cat /opt/vault/tls/vault-ca.pem)" \
  -leader-client-cert="$(cat /opt/vault/tls/vault-cert.pem)" \
  -leader-client-key="$(cat /opt/vault/tls/vault-key.pem)" \
  https://<node1-ip>:8200
```

Verify on leader:

```bash
vault operator raft list-peers
vault status
```

## 4) Commands and Scripts Used in Non-Prod (Carry to Prod)

### 4.1 Core engines and DB config

Enable engines once:

```bash
vault secrets enable database
vault secrets enable -path=kv -version=2 kv
```

Connection configs (examples, replace with prod names/endpoints):

```bash
# MySQL
vault write database/config/prod-mysql-app \
  plugin_name="mysql-rds-database-plugin" \
  connection_url="{{username}}:{{password}}@tcp(<mysql-endpoint>:3306)/" \
  username="<vault_admin_mysql_prod>" \
  password="<password>" \
  allowed_roles="*" \
  username_template="d-{{.RoleName}}-{{random 6}}"

# PostgreSQL
vault write database/config/prod-postgres-app \
  plugin_name="postgresql-database-plugin" \
  connection_url="postgresql://{{username}}:{{password}}@<postgres-endpoint>:5432/postgres?sslmode=require" \
  username="<vault_admin_postgres_prod>" \
  password="<password>" \
  allowed_roles="*" \
  username_template="d-{{.RoleName}}-{{random 6}}"

# Redshift
vault write database/config/prod-redshift-dev \
  plugin_name="postgresql-database-plugin" \
  connection_url="postgresql://{{username}}:{{password}}@<redshift-endpoint>:5439/dev?sslmode=require" \
  username="<vault_admin_redshift_prod>" \
  password="<password>" \
  allowed_roles="*" \
  username_template="dwh-{{.RoleName}}-{{random 6}}"
```

Quick fix for only `allowed_roles=*` on existing connection:

```bash
vault write database/config/<connection_name> allowed_roles="*"
```

### 4.2 Drift/smoke checks (non-prod proven)

```bash
vault list database/config
vault list database/roles
VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh

vault read database/creds/<mysql-role>
vault read database/creds/<postgres-role>
vault write sys/leases/revoke lease_id="<lease_id>"
```

### 4.3 Scripts to install in production

NPAMX host:

- `/opt/npamx/scripts/cleanup-stale-jit-permission-sets.py`
- `/opt/npamx/scripts/install-weekly-jit-permission-set-cleanup-cron.sh`
- `/opt/npamx/scripts/cleanup-host-logs.sh`

Vault host:

- `/opt/npamx/scripts/check-vault-db-drift.sh`
- `/opt/npamx/scripts/sync-vault-db-config-from-kv.py`
- `/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh`
- `/etc/npamx/vault-db-admin-sync.json`

Install cron jobs (same pattern as non-prod):

```bash
# Vault host drift check (Friday 05:30 IST)
(crontab -l 2>/dev/null; echo 'CRON_TZ=Asia/Kolkata'; echo '30 5 * * 5 VAULT_DB_MOUNT=database /opt/npamx/scripts/check-vault-db-drift.sh >> /var/log/vault-db-drift.log 2>&1') | crontab -

# Vault host KV->database/config sync (every 10 min)
SCRIPT_PATH="/opt/npamx/scripts/sync-vault-db-config-from-kv.py" \
MAPPING_FILE="/etc/npamx/vault-db-admin-sync.json" \
DATABASE_MOUNT="database" \
CRON_TZ_VALUE="Asia/Kolkata" \
CRON_SCHEDULE="*/10 * * * *" \
/opt/npamx/scripts/install-vault-db-config-kv-sync-cron.sh
```

### 4.4 Vault audit log archival to S3

Use rotated Vault audit logs as the archive source of truth. Do not copy the live audit file to S3 on every run.

Archive prefixes:

- nonprod: `s3://npamx-logs/nonprod-vault/audit/`
- prod: `s3://npamx-logs/prod-vault/audit/`

First verify the audit device path:

```bash
vault audit list -detailed
```

Expected:

- `file_path=/var/log/vault_audit.log`

Install the upload script on Vault hosts:

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

Configure log rotation:

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

Force one validation cycle:

```bash
sudo logrotate -f /etc/logrotate.d/vault-audit
ls -lh /var/log/vault_audit.log*
tail -n 50 /var/log/vault-audit-s3-sync.log
```

Verify archive objects:

```bash
aws s3 ls s3://npamx-logs/nonprod-vault/audit/ --recursive | tail -n 20
aws s3 ls s3://npamx-logs/prod-vault/audit/ --recursive | tail -n 20
```

Recommended operations stance:

- keep local rotated files for a short rolling window only
- keep long-term retention in S3
- use 365-day lifecycle on the bucket/prefix
- if you need faster archival, change `weekly` to `daily`

## 5) UI, KV, OAuth, Userpass Setup

### 5.1 KV setup for DB admin credential storage

Store one secret per connection:

```bash
vault kv put kv/npamx/prod/db-admin/connections/<connection_name> username="<vault_admin_user>" password="<vault_admin_password>"
vault kv get kv/npamx/prod/db-admin/connections/<connection_name>
```

Important: Vault `database/config` does not auto-read KV by itself. Use the sync script if KV is source of truth.

### 5.2 Vault UI access policy for KV/database views

Example policy (attach to operator groups/users that need UI visibility):

```hcl
path "sys/internal/ui/mounts" { capabilities = ["read"] }
path "sys/internal/ui/mounts/*" { capabilities = ["read"] }
path "sys/mounts" { capabilities = ["read"] }
path "database/config" { capabilities = ["list"] }
path "database/config/*" { capabilities = ["read","create","update","list"] }
path "kv/data/npamx/*" { capabilities = ["read","create","update"] }
path "kv/metadata/npamx/*" { capabilities = ["read","list"] }
```

### 5.3 OAuth/OIDC (recommended for human users)

Enable and configure OIDC auth:

```bash
vault auth enable oidc
vault write auth/oidc/config \
  oidc_discovery_url="https://<idp-discovery-url>" \
  oidc_client_id="<client-id>" \
  oidc_client_secret="<client-secret>" \
  default_role="vault-ui"

vault write auth/oidc/role/vault-ui \
  user_claim="email" \
  groups_claim="groups" \
  allowed_redirect_uris="https://<vault-url>/ui/vault/auth/oidc/oidc/callback" \
  allowed_redirect_uris="https://<vault-url>/oidc/callback" \
  policies="default"
```

Map IdP group to Vault policies:

```bash
OIDC_ACCESSOR="$(vault auth list -detailed | awk '$1=="oidc/"{print $3}')"
vault write identity/group name="vault-admins" type="external" policies="default,vault-ui-admin"
GROUP_ID="$(vault read -field=id identity/group/name/vault-admins)"
vault write identity/group-alias name="vault-admins" mount_accessor="$OIDC_ACCESSOR" canonical_id="$GROUP_ID"
```

### 5.4 userpass (break-glass only)

Keep `userpass` only for emergency/bootstrap admins:

```bash
vault auth enable userpass
vault policy write devops-db-connections-only /tmp/devops-db-connections-only.hcl
vault write auth/userpass/users/<breakglass-user> password="<strong-password>" policies="default,devops-db-connections-only"
```

### 5.5 AWS auth for NPAMX backend

If NPAMX uses IAM auth method:

```bash
vault auth enable aws
vault write auth/aws/config/client
vault write auth/aws/role/npamx-backend-iam \
  auth_type=iam \
  bound_iam_principal_arn="arn:aws:iam::<npamx-account-id>:role/<npamx-ec2-role>" \
  policies="pam-backend,npamx-vault-db-tester" \
  ttl=1h
```

Validate:

```bash
vault read auth/aws/role/npamx-backend-iam
```

## 6) Production Handover Checklist (High-Level)

1. Raft cluster healthy (`vault operator raft list-peers`).
2. TLS validated on all nodes.
3. `database/` and `kv/` engines enabled.
4. All production `database/config/*` entries exist and `allowed_roles=*` (unless intentionally restricted).
5. OIDC login works for admins; `userpass` limited to break-glass.
6. NPAMX host and Vault host scripts installed with cron.
7. Mint/revoke smoke test passes for MySQL/PostgreSQL/Redshift paths.
8. NPAMX fresh request + revoke tests pass for all engines.
