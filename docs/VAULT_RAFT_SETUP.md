# Vault Raft Setup Runbook

This runbook documents the working setup path used for the non-prod Vault Raft cluster and is intended to be reused for production with environment-specific values.

## Scope

- `3` Vault nodes
- Raft integrated storage
- AWS KMS auto-unseal
- TLS enabled with a self-generated internal CA
- Private IP addressing
- Systemd-managed Vault service

## Target Ports

- `8200` Vault API and UI
- `8201` Vault cluster traffic

## Baseline Requirements

- `3` Linux EC2 instances
- `100 GB gp3` encrypted EBS per node
- private subnets only
- no public IPs
- security group allows:
  - `8200` from PAM app path
  - `8200` from Vault SG to Vault SG
  - `8201` from Vault SG to Vault SG
- IAM role on each node with KMS permissions for the auto-unseal key
- KMS key policy allows the Vault IAM role to use the key

## Example Node IPs

- node 1: `172.36.1.173`
- node 2: `172.36.1.181`
- node 3: `172.36.1.226`

Replace these IPs for production.

## 1. Install Vault

Run on all three nodes.

```bash
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo $VERSION_CODENAME) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update
sudo apt install -y vault
```

## 2. Prepare Directories

Run on all three nodes.

```bash
sudo mkdir -p /etc/vault.d
sudo mkdir -p /opt/vault/data
sudo mkdir -p /opt/vault/tls
sudo chown -R vault:vault /opt/vault/data
sudo chmod 750 /opt/vault/data
```

## 3. Generate One Shared CA

Run on node 1 only.

```bash
mkdir -p ~/vault-certs
cd ~/vault-certs

openssl genrsa -out vault-ca.key 4096

openssl req -x509 -new -nodes \
  -key vault-ca.key \
  -sha256 -days 3650 \
  -out vault-ca.pem \
  -subj "/C=IN/ST=KA/L=Bengaluru/O=YourOrg/OU=Security/CN=Vault-Internal-CA"
```

Important:

- create the CA once
- do not create a different CA on node 2 or node 3
- never copy `vault-ca.key` to node 2 or node 3

## 4. Generate Node Certificates

Run on node 1 only.

### Node 1

```bash
cd ~/vault-certs

openssl genrsa -out vault-node-1.key 4096

cat > vault-node-1.cnf <<'EOF'
[ req ]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[ dn ]
C = IN
ST = KA
L = Bengaluru
O = YourOrg
OU = Security
CN = 172.36.1.173

[ req_ext ]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth

[ alt_names ]
IP.1 = 172.36.1.173
DNS.1 = vault-node-1
EOF

openssl req -new -key vault-node-1.key -out vault-node-1.csr -config vault-node-1.cnf

openssl x509 -req \
  -in vault-node-1.csr \
  -CA vault-ca.pem \
  -CAkey vault-ca.key \
  -CAcreateserial \
  -out vault-node-1.crt \
  -days 825 \
  -sha256 \
  -extensions req_ext \
  -extfile vault-node-1.cnf
```

### Node 2

```bash
cd ~/vault-certs

openssl genrsa -out vault-node-2.key 4096

cat > vault-node-2.cnf <<'EOF'
[ req ]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[ dn ]
C = IN
ST = KA
L = Bengaluru
O = YourOrg
OU = Security
CN = 172.36.1.181

[ req_ext ]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth

[ alt_names ]
IP.1 = 172.36.1.181
DNS.1 = vault-node-2
EOF

openssl req -new -key vault-node-2.key -out vault-node-2.csr -config vault-node-2.cnf

openssl x509 -req \
  -in vault-node-2.csr \
  -CA vault-ca.pem \
  -CAkey vault-ca.key \
  -CAcreateserial \
  -out vault-node-2.crt \
  -days 825 \
  -sha256 \
  -extensions req_ext \
  -extfile vault-node-2.cnf
```

### Node 3

```bash
cd ~/vault-certs

openssl genrsa -out vault-node-3.key 4096

cat > vault-node-3.cnf <<'EOF'
[ req ]
default_bits = 4096
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[ dn ]
C = IN
ST = KA
L = Bengaluru
O = YourOrg
OU = Security
CN = 172.36.1.226

[ req_ext ]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth

[ alt_names ]
IP.1 = 172.36.1.226
DNS.1 = vault-node-3
EOF

openssl req -new -key vault-node-3.key -out vault-node-3.csr -config vault-node-3.cnf

openssl x509 -req \
  -in vault-node-3.csr \
  -CA vault-ca.pem \
  -CAkey vault-ca.key \
  -CAcreateserial \
  -out vault-node-3.crt \
  -days 825 \
  -sha256 \
  -extensions req_ext \
  -extfile vault-node-3.cnf
```

## 5. Install TLS Files on Each Node

Each node needs:

- its own private key
- its own certificate
- the shared `vault-ca.pem`

### Node 1

Run on node 1.

```bash
sudo cp ~/vault-certs/vault-node-1.key /opt/vault/tls/vault-key.pem
sudo cp ~/vault-certs/vault-ca.pem /opt/vault/tls/vault-ca.pem
cat ~/vault-certs/vault-node-1.crt ~/vault-certs/vault-ca.pem | sudo tee /opt/vault/tls/vault-cert.pem >/dev/null

sudo chown root:vault /opt/vault/tls/vault-key.pem
sudo chown root:root /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
sudo chmod 640 /opt/vault/tls/vault-key.pem
sudo chmod 644 /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
```

### Node 2 and Node 3 via SSM Paste

Use node 1 to print the contents:

```bash
cat ~/vault-certs/vault-node-2.key
cat ~/vault-certs/vault-node-2.crt
cat ~/vault-certs/vault-ca.pem
```

On node 2:

```bash
sudo tee /opt/vault/tls/vault-key.pem >/dev/null
```

Paste full contents of `vault-node-2.key`, then press `Ctrl+D`.

```bash
sudo tee /opt/vault/tls/vault-ca.pem >/dev/null
```

Paste full contents of `vault-ca.pem`, then press `Ctrl+D`.

```bash
sudo tee /opt/vault/tls/vault-cert.pem >/dev/null
```

Paste full contents of `vault-node-2.crt`, then immediately paste full contents of `vault-ca.pem`, then press `Ctrl+D`.

Set permissions:

```bash
sudo chown root:vault /opt/vault/tls/vault-key.pem
sudo chown root:root /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
sudo chmod 640 /opt/vault/tls/vault-key.pem
sudo chmod 644 /opt/vault/tls/vault-cert.pem /opt/vault/tls/vault-ca.pem
```

Repeat the same process on node 3 using `vault-node-3.key` and `vault-node-3.crt`.

## 6. Validate TLS Files Before Starting Vault

Run on node 2 and node 3 after pasting the files.

```bash
openssl rsa -noout -modulus -in /opt/vault/tls/vault-key.pem | openssl md5
openssl x509 -noout -modulus -in /opt/vault/tls/vault-cert.pem | openssl md5
```

The two hashes must match.

To verify the CA is identical across nodes:

```bash
openssl x509 -in /opt/vault/tls/vault-ca.pem -noout -fingerprint -sha256
```

The fingerprint must match the CA fingerprint on node 1.

## 7. Vault Configuration

Create `/etc/vault.d/vault.hcl` on each node.

### Node 1

```hcl
ui = true
cluster_name = "vault-nonprod"
disable_mlock = true

api_addr     = "https://172.36.1.173:8200"
cluster_addr = "https://172.36.1.173:8201"

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file   = "/opt/vault/tls/vault-cert.pem"
  tls_key_file    = "/opt/vault/tls/vault-key.pem"
}

storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-node-1"
}

seal "awskms" {
  region     = "ap-south-1"
  kms_key_id = "arn:aws:kms:ap-south-1:011528273240:key/f76eb92e-6bf7-4236-a5e1-d404919bec46"
}
```

### Node 2

```hcl
ui = true
cluster_name = "vault-nonprod"
disable_mlock = true

api_addr     = "https://172.36.1.181:8200"
cluster_addr = "https://172.36.1.181:8201"

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file   = "/opt/vault/tls/vault-cert.pem"
  tls_key_file    = "/opt/vault/tls/vault-key.pem"
}

storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-node-2"
}

seal "awskms" {
  region     = "ap-south-1"
  kms_key_id = "arn:aws:kms:ap-south-1:011528273240:key/f76eb92e-6bf7-4236-a5e1-d404919bec46"
}
```

### Node 3

```hcl
ui = true
cluster_name = "vault-nonprod"
disable_mlock = true

api_addr     = "https://172.36.1.226:8200"
cluster_addr = "https://172.36.1.226:8201"

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file   = "/opt/vault/tls/vault-cert.pem"
  tls_key_file    = "/opt/vault/tls/vault-key.pem"
}

storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-node-3"
}

seal "awskms" {
  region     = "ap-south-1"
  kms_key_id = "arn:aws:kms:ap-south-1:011528273240:key/f76eb92e-6bf7-4236-a5e1-d404919bec46"
}
```

Set permissions on all nodes:

```bash
sudo chown root:vault /etc/vault.d/vault.hcl
sudo chmod 640 /etc/vault.d/vault.hcl
```

## 8. KMS Permissions

Vault will not start unless both permissions exist.

### IAM policy on the Vault EC2 role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VaultAutoUnsealKmsAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:ap-south-1:011528273240:key/f76eb92e-6bf7-4236-a5e1-d404919bec46"
    }
  ]
}
```

### KMS key policy in the KMS-owning account

```json
{
  "Sid": "AllowSecurityAccountVaultRole",
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::116155851700:role/vault-raft-role"
  },
  "Action": [
    "kms:Encrypt",
    "kms:Decrypt",
    "kms:DescribeKey"
  ],
  "Resource": "*"
}
```

## 9. Start Vault on All Nodes

Run on all three nodes.

```bash
sudo systemctl enable vault
sudo systemctl restart vault
sudo systemctl status vault --no-pager
sudo journalctl -u vault -n 50 --no-pager
sudo ss -ltnp | egrep '8200|8201'
```

Before initialization, this warning is expected:

```text
failed to unseal core: error="stored unseal keys are supported, but none were found"
```

## 10. Initialize the Cluster

Run only on node 1.

Important:

- use the node IP, not `127.0.0.1`
- the certificate SAN contains the node IP

```bash
export VAULT_ADDR=https://172.36.1.173:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault status
vault operator init
```

Save securely:

- recovery keys
- initial root token

Then verify:

```bash
vault status
```

Expected:

- `Initialized true`
- `Sealed false`
- `HA Mode active`

## 11. Join Node 2 and Node 3

### Node 2

```bash
export VAULT_ADDR=https://172.36.1.181:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault operator raft join \
  -leader-ca-cert="$(cat /opt/vault/tls/vault-ca.pem)" \
  -leader-client-cert="$(cat /opt/vault/tls/vault-cert.pem)" \
  -leader-client-key="$(cat /opt/vault/tls/vault-key.pem)" \
  https://172.36.1.173:8200
```

### Node 3

```bash
export VAULT_ADDR=https://172.36.1.226:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault operator raft join \
  -leader-ca-cert="$(cat /opt/vault/tls/vault-ca.pem)" \
  -leader-client-cert="$(cat /opt/vault/tls/vault-cert.pem)" \
  -leader-client-key="$(cat /opt/vault/tls/vault-key.pem)" \
  https://172.36.1.173:8200
```

## 12. Verify Cluster Membership

Run on node 1:

```bash
export VAULT_ADDR=https://172.36.1.173:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault operator raft list-peers
vault status
```

## 13. Connectivity Tests

From node 2 or node 3, confirm node 1 is reachable:

```bash
curl -v --cacert /opt/vault/tls/vault-ca.pem https://172.36.1.173:8200/v1/sys/health
nc -vz 172.36.1.173 8200
nc -vz 172.36.1.173 8201
```

## 14. Common Problems

### Wrong CA on node 2 or node 3

Symptom:

```text
SSL certificate problem: self-signed certificate in certificate chain
```

Fix:

- replace `vault-ca.pem` with the CA from node 1
- replace the node cert with the correct node cert signed by that CA

### Key and cert mismatch

Symptom:

```text
tls: private key does not match public key
```

Fix:

- repaste the correct node key and node cert
- re-run modulus check

### Smart quotes in `vault.hcl`

Symptom:

```text
literal not terminated
```

Fix:

- replace all non-ASCII quotes with plain `"`

### Using `127.0.0.1` with IP-only certificates

Symptom:

```text
x509: certificate is valid for <node-ip>, not 127.0.0.1
```

Fix:

- export `VAULT_ADDR` with the node private IP

### KMS permission failure

Symptom:

```text
AccessDeniedException ... kms:DescribeKey
```

Fix:

- add IAM policy to the Vault EC2 role
- add the Vault role to the KMS key policy

## 15. Post-Setup Hardening

After cluster formation:

1. enable Vault audit logging
2. create named admin policies and users
3. stop using the root token for regular work
4. store recovery keys securely offline
5. keep Vault UI private only
6. send security logs to CloudWatch and long-term archive

## 16. Bootstrap Admin Steps After Cluster Join

Run these on node 1 after all peers have joined.

### Login With the Bootstrap Root Token

```bash
export VAULT_ADDR=https://172.36.1.173:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault login
```

Important:

- the initial root token is bootstrap-only
- after backend auth and named admin access are working, revoke it

### Make Vault CLI Stable on Each Node

Set the Vault CLI environment persistently so admin commands do not keep falling back to `https://127.0.0.1:8200`.

#### Node 1

```bash
cat >> ~/.bashrc <<'EOF'
export VAULT_ADDR=https://172.36.1.173:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem
EOF

source ~/.bashrc
```

#### Node 2

```bash
cat >> ~/.bashrc <<'EOF'
export VAULT_ADDR=https://172.36.1.181:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem
EOF

source ~/.bashrc
```

#### Node 3

```bash
cat >> ~/.bashrc <<'EOF'
export VAULT_ADDR=https://172.36.1.226:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem
EOF

source ~/.bashrc
```

Verify:

```bash
echo "$VAULT_ADDR"
echo "$VAULT_CACERT"
vault status
```

Later, when internal DNS is available, replace node IPs with the internal Vault DNS name.

### Verify Cluster Peers

`vault status` works without a token, but `raft list-peers` requires login.

```bash
vault status
vault operator raft list-peers
```

### Enable Audit Logging

Before enabling audit, create the audit file on all nodes:

```bash
sudo touch /var/log/vault_audit.log
sudo chown vault:vault /var/log/vault_audit.log
sudo chmod 640 /var/log/vault_audit.log
```

Then on node 1:

```bash
vault audit enable file \
  file_path=/var/log/vault_audit.log \
  hmac_accessor=false \
  elide_list_responses=true

vault audit list
```

### Archive Vault Audit Logs to S3

Vault audit logs should be retained in S3 using rotated files only. Do not upload the live `/var/log/vault_audit.log` repeatedly, because that creates duplicate copies of the same file content.

Recommended prefixes:

- nonprod Vault: `s3://npamx-logs/nonprod-vault/audit/`
- prod Vault: `s3://npamx-logs/prod-vault/audit/`

First confirm the active file audit path:

```bash
vault audit list -detailed
```

Expected output includes:

- `file_path=/var/log/vault_audit.log`

Install the rotated-file upload script on each Vault cluster:

Nonprod:

```bash
mkdir -p /opt/npamx/scripts

cat >/opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-nonprod-vault}"
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

Prod uses the same script, but call it with `prod-vault`:

```bash
/opt/npamx/scripts/upload-vault-audit-rotated-to-s3.sh prod-vault npamx-logs /var/log/vault_audit.log audit
```

Configure weekly rotation and post-rotate upload:

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

Force one test rotation:

```bash
sudo logrotate -f /etc/logrotate.d/vault-audit
```

Verify locally:

```bash
ls -lh /var/log/vault_audit.log*
tail -n 50 /var/log/vault-audit-s3-sync.log
```

Verify in S3:

```bash
aws s3 ls s3://npamx-logs/nonprod-vault/audit/ --recursive | tail -n 20
aws s3 ls s3://npamx-logs/prod-vault/audit/ --recursive | tail -n 20
```

Expected object pattern:

- `nonprod-vault/audit/YYYY/MM/DD/<hostname>_vault_audit.log.1`
- `prod-vault/audit/YYYY/MM/DD/<hostname>_vault_audit.log.1`

Operational notes:

- Keep local retention small and let S3 carry the long-term retention load.
- `weekly` + `rotate 8` keeps about 8 weeks locally.
- For faster S3 delivery, change `weekly` to `daily`.
- Apply an S3 lifecycle rule on `npamx-logs` for 365-day retention.
- If you accidentally uploaded a bad object from an older wrong path or script, remove it manually with `aws s3 rm`.

### Create the Backend Policy

```bash
cat >/tmp/pam-backend-policy.hcl <<'EOF'
path "database/config/*" {
  capabilities = ["read"]
}

path "database/roles/*" {
  capabilities = ["create", "update", "read", "delete", "list"]
}

path "database/creds/*" {
  capabilities = ["read"]
}

path "sys/leases/lookup" {
  capabilities = ["update"]
}

path "sys/leases/revoke" {
  capabilities = ["update"]
}
EOF

vault policy write pam-backend /tmp/pam-backend-policy.hcl
vault policy read pam-backend
```

### Enable AppRole for the PAM Backend

```bash
vault auth enable approle
```

If it is already enabled, Vault will tell you.

Create the backend AppRole:

```bash
vault write auth/approle/role/pam-backend \
  token_policies="pam-backend" \
  token_type="batch" \
  secret_id_ttl="24h" \
  token_ttl="1h" \
  token_max_ttl="4h" \
  secret_id_num_uses=0
```

Read the `role_id`:

```bash
vault read auth/approle/role/pam-backend/role-id
```

Create the `secret_id`:

```bash
vault write -f auth/approle/role/pam-backend/secret-id
```

### Test AppRole Login

```bash
vault write auth/approle/login \
  role_id="<role_id>" \
  secret_id="<secret_id>"
```

Optional token lookup test:

```bash
export BACKEND_TOKEN=$(vault write -field=token auth/approle/login \
  role_id="<role_id>" \
  secret_id="<secret_id>")

VAULT_TOKEN="$BACKEND_TOKEN" vault token lookup
```

The resulting token should carry the `pam-backend` policy.

## 17. Store Bootstrap Secrets in AWS Secrets Manager

Recommended secrets:

- `vault/nonprod/pam-backend/role-id`
- `vault/nonprod/pam-backend/secret-id`
- `vault/nonprod/root-token-bootstrap`
- `vault/nonprod/recovery-share-1`
- `vault/nonprod/recovery-share-2`
- `vault/nonprod/recovery-share-3`
- `vault/nonprod/recovery-share-4`
- `vault/nonprod/recovery-share-5`

Suggested commands:

```bash
aws secretsmanager create-secret \
  --name vault/nonprod/pam-backend/role-id \
  --secret-string '<role_id>'

aws secretsmanager create-secret \
  --name vault/nonprod/pam-backend/secret-id \
  --secret-string '<secret_id>'
```

Important:

- keep `vault-ca.key` off the Vault servers
- do not use Secrets Manager as a general place to store all Vault-generated dynamic DB passwords
- store the root token only temporarily for bootstrap, then remove it after revoke
- do not grant broad read access to recovery shares

## 18. Enable the Database Secrets Engine

Run on node 1:

```bash
vault secrets enable database
vault secrets list
```

If `database/` is already enabled, Vault will report that.

## 19. Configure the First Nonprod Database

Onboard one engine first and validate it end to end before adding more.

### MySQL Example

```bash
vault write database/config/nonprod-mysql \
  plugin_name="mysql-database-plugin" \
  connection_url="{{username}}:{{password}}@tcp(<DB_HOST>:3306)/" \
  allowed_roles="*" \
  username="<vault_db_admin_user>" \
  password="<vault_db_admin_password>"
```

Working nonprod MySQL example used in this project:

```bash
vault write database/config/nonprod-mysql \
  plugin_name="mysql-database-plugin" \
  connection_url="{{username}}:{{password}}@tcp(database-1.cjqnggjluhbw.ap-south-1.rds.amazonaws.com:3306)/" \
  allowed_roles="*" \
  username="vault_admin_mysql_np" \
  password="<mysql_vault_admin_password>" \
  username_template="d-{{.RoleName}}"
```

Confirmed behavior:

- write this only on the active Vault node
- Raft replicates the config across the cluster
- do not repeat `database/config/...` on node 2 and node 3

### PostgreSQL Example

```bash
vault write database/config/nonprod-postgres \
  plugin_name="postgresql-database-plugin" \
  connection_url="postgresql://{{username}}:{{password}}@<DB_HOST>:5432/postgres?sslmode=require" \
  allowed_roles="*" \
  username="<vault_db_admin_user>" \
  password="<vault_db_admin_password>"
```

After writing the DB config, rotate the DB management credential:

```bash
vault write -force database/rotate-root/nonprod-mysql
```

or:

```bash
vault write -force database/rotate-root/nonprod-postgres
```

Confirmed nonprod MySQL sequence completed:

```bash
vault read database/config/nonprod-mysql
vault write -force database/rotate-root/nonprod-mysql
```

### Existing POC Values Recovered From the Old Vault

The old single-node POC exposed enough configuration to reuse the DB target and role patterns:

- MySQL endpoint:
  - `database-1.cjqnggjluhbw.ap-south-1.rds.amazonaws.com:3306`
- old MySQL config names:
  - `my-mysql`
  - `rds1`
- old username template:
  - `D-{{.RoleName}}-{{random 4}}`
- working POC role examples:
  - `dynamic-mysql-role`
  - `jit_example_user-37022dae`

The old POC also proved that issuing MySQL credentials from Vault worked.

Do not attempt to read or depend on raw files under `/opt/vault/data/...` for production operations. Use Vault API and CLI only.

## 20. Create a Dynamic Database Role

Use the SQL pattern already validated in the earlier POC for each engine.

Example shape:

```bash
vault write database/roles/np-jit-read \
  db_name="nonprod-mysql" \
  creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT ON <db>.* TO '{{name}}'@'%';" \
  revocation_statements="DROP USER '{{name}}'@'%';" \
  default_ttl="1h" \
  max_ttl="8h"
```

Confirmed working MySQL role pattern for this project:

```bash
vault write database/roles/np-jit-read \
  db_name="nonprod-mysql" \
  creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT ON mydb.* TO '{{name}}'@'%';" \
  revocation_statements="DROP USER IF EXISTS '{{name}}'@'%';" \
  default_ttl="1h" \
  max_ttl="24h"
```

Notes:

- the final SQL should be engine-specific
- NPAMX creates short per-request Vault database roles such as `<requester>-<id4>`, so the database connection must allow dynamic role names.
- Use `allowed_roles="*"` on the Vault database connection for the NPAMX dynamic-role model.
- Use `username_template="d-{{.RoleName}}"` for MySQL so final DB usernames follow `d-username-id4` and stay within MySQL's 32-character limit.
- use controlled naming via the role/plugin behavior and application metadata
- do not log returned passwords in application logs
- do not include `FLUSH PRIVILEGES` in MySQL role statements unless the Vault DB management user explicitly has the required privilege

## 21. Test Credential Issue and Revoke

Issue credentials:

```bash
vault read database/creds/np-jit-read
```

Expected output includes:

- `username`
- `password`
- `lease_id`
- `lease_duration`

Then test revoke:

```bash
vault lease revoke <lease_id>
```

## 22. RDS Proxy Decision For This Phase

For the current Vault TTL-based password user model:

- do not place Vault-issued dynamic password users behind RDS Proxy
- connect Vault directly to the RDS MySQL and PostgreSQL endpoints

Reason:

- RDS Proxy expects Secrets Manager-backed credentials or IAM-oriented auth flows
- Vault dynamic password users would require extra per-user proxy secret handling, which defeats the purpose of Vault dynamic credentials

Current decision:

- MySQL and PostgreSQL testing in this phase uses direct DB endpoints from Vault
- RDS Proxy will be revisited later for IAM-based access patterns
- Redshift remains a separate path

## 23. What the PAM Backend Will Use

The PAM backend should:

1. authenticate to Vault using AppRole
2. call `database/creds/<role>`
3. store only:
   - request ID
   - Vault role name
   - lease ID
   - issued DB username
   - expiry time
   - target DB metadata
4. revoke using the Vault lease ID

The PAM backend should not:

- use the Vault root token
- read or rely on raw files under Vault Raft storage
- store dynamic DB passwords broadly in its own database

### Backend Runtime Prerequisites

For the current backend implementation, end-to-end DB activation requires these backend environment variables for the target plane:

- `VAULT_ADDR_NONPROD`
- `VAULT_ROLE_ID_NONPROD`
- `VAULT_SECRET_ID_NONPROD`

For user-facing connection details, the backend currently also expects a DB access endpoint:

- `DB_CONNECT_PROXY_HOST_NONPROD`
- `DB_CONNECT_PROXY_PORT_NONPROD`

Notes:

- Vault database config and roles are cluster-side and already stored in Vault
- the backend still needs its own AppRole values to log in to Vault at runtime
- if `DB_CONNECT_PROXY_HOST_NONPROD` is missing, the app will treat the database access service as not configured
- in this phase, RDS Proxy is not used for Vault-issued dynamic password users

Backend improvements applied in this repo:

- `VAULT_SECRET_ID_NONPROD` can now be supplied either directly or through `VAULT_SECRET_ID_SECRET_NAME_NONPROD`
- `VAULT_ROLE_ID_NONPROD` can also be supplied through a matching `*_SECRET_NAME` env if needed
- Vault DB connection names are now engine-aware
  - MySQL default: `nonprod-mysql`
  - PostgreSQL default: `nonprod-postgres`
- direct nonprod DB endpoint fallback can be enabled for testing with:
  - `DB_CONNECT_ALLOW_DIRECT_NONPROD=true`

Current test scope with the existing backend:

- MySQL is ready for request -> approval -> activation -> credential retrieval -> PAM terminal/query execution
- PostgreSQL is ready for request -> approval -> activation -> credential retrieval
- PostgreSQL PAM terminal/query execution is not wired yet because the current query executor is still MySQL-only
- RDS Proxy is still deferred for this password-based Vault testing phase

Recommended runtime split:

- keep `VAULT_SECRET_ID_NONPROD` in Secrets Manager
- keep `VAULT_ADDR_NONPROD` and `VAULT_ROLE_ID_NONPROD` as controlled backend env/config
- use direct DB endpoint fallback only for nonprod testing until a proper DB access endpoint exists

### Backend Container Runtime Example

Use these values in the backend container or EC2 service environment for current nonprod testing:

```env
VAULT_ADDR_NONPROD=https://172.36.1.173:8200
VAULT_CACERT_NONPROD=/absolute/path/to/vault-ca.pem
VAULT_ROLE_ID_NONPROD=<approle-role-id>
VAULT_SECRET_ID_SECRET_NAME_NONPROD=vault/nonprod/pam-backend/secret-id
VAULT_DB_MOUNT_NONPROD=database
DB_CONNECT_ALLOW_DIRECT_NONPROD=true
AWS_REGION=ap-south-1
```

Notes:

- `DB_CONNECT_ALLOW_DIRECT_NONPROD=true` is only for current nonprod testing
- `VAULT_CACERT_NONPROD` is required when the backend talks to the self-signed Vault cluster from localhost or any host that does not already trust the Vault CA
- for production, use the final internal Vault DNS name instead of the node IP
- if a real DB access endpoint is introduced later, replace the direct fallback with:
  - `DB_CONNECT_PROXY_HOST_NONPROD`
  - `DB_CONNECT_PROXY_PORT_NONPROD`

### Localhost UI Testing

For local end-to-end testing from a laptop, run the backend and frontend from the same Flask process so the UI can use same-origin `/api`.

From `backend/`:

```bash
source venv/bin/activate
export FRONTEND_DIR="$(pwd)/../frontend"
PORT=5001 gunicorn --worker-tmp-dir /tmp --workers 2 --threads 4 --timeout 120 --bind 0.0.0.0:5001 docker_serve:app
```

Then open:

- `http://localhost:5001`

Notes:

- port `5000` may be occupied by macOS Control Center / AirPlay Receiver
- the frontend bootstrap in this repo now treats `5001` as same-origin and calls `/api` correctly

## 24. Documentation Discipline

This runbook is the authoritative Vault setup record for this project.

Whenever Vault-side work changes, update this document immediately, including:

- cluster setup changes
- TLS/certificate changes
- KMS or IAM policy changes
- auth method changes
- database config onboarding
- dynamic role patterns
- audit or hardening changes

## 25. NPAMX Database Engine Notes

This section captures the final working Vault-side setup used by NPAMX for database activation.

### Working MySQL Database Connection

Use on the active Vault node:

```bash
export VAULT_ADDR=https://172.36.1.173:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem
```

Working update command:

```bash
vault write database/config/nonprod-mysql \
  plugin_name="mysql-database-plugin" \
  connection_url="{{username}}:{{password}}@tcp(database-1.cjqnggjluhbw.ap-south-1.rds.amazonaws.com:3306)/" \
  allowed_roles="*" \
  username="vault_admin_mysql_np" \
  password="StrongTempPassword#123!" \
  username_template="d-{{.RoleName}}"
```

Validate:

```bash
vault read database/config/nonprod-mysql
```

### Why `allowed_roles="*"` matters

NPAMX creates dynamic Vault role names per request. If the Vault DB connection is still limited to a small static role list, activation fails with errors like:

- `is not an allowed role`

So the working NPAMX model uses:

- `allowed_roles="*"`

on the Vault DB connection.

### Database admin user used by Vault

The DB admin user configured in Vault must actually work from the Vault node.

Example reset and grant flow:

```sql
CREATE USER IF NOT EXISTS 'vault_admin_mysql_np'@'%' IDENTIFIED BY 'StrongTempPassword#123!';
ALTER USER 'vault_admin_mysql_np'@'%' IDENTIFIED BY 'StrongTempPassword#123!';

GRANT CREATE USER ON *.* TO 'vault_admin_mysql_np'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP ON mydb.* TO 'vault_admin_mysql_np'@'%';

FLUSH PRIVILEGES;
SHOW GRANTS FOR 'vault_admin_mysql_np'@'%';
```

If `vault write database/config/nonprod-mysql ...` fails with:

- `Access denied for user 'vault_admin_mysql_np'...`

first verify direct DB login from the Vault node.

### IAM-authenticated DB users

For the RDS Proxy IAM flow, the JIT DB user must be created as an IAM-authenticated MySQL user:

```sql
CREATE USER 'd-satish-korra-7718'@'%' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
GRANT SELECT, SHOW VIEW ON mydb.* TO 'd-satish-korra-7718'@'%';
```

Validate:

```sql
SHOW CREATE USER 'd-satish-korra-7718'@'%';
SHOW GRANTS FOR 'd-satish-korra-7718'@'%';
```

### Username-length lesson

Very long generated usernames caused MySQL failures. The final NPAMX JIT naming pattern must remain within MySQL limits while still being human-readable.

Example working username:

- `d-satish-korra-7718`

### Revoke behavior

When NPAMX revokes a database session:

- Vault lease revoke should run
- DB user should be removed or lose effective access
- request state should become `revoked`
- `db_sessions` should be cleaned in NPAMX persistence

If the DB user is gone but UI still shows the request/session as active, inspect:

```bash
sqlite3 /opt/npamx/data/npamx.db "select request_id, status, json_extract(payload_json, '$.status') from requests where request_id='<REQUEST_ID>';"
sqlite3 /opt/npamx/data/npamx.db "select request_id, db_username, lease_id from db_sessions where request_id='<REQUEST_ID>';"
```

### Common Vault-side errors seen during this project

#### `Unable to locate credentials`

Cause:

- application container could not access AWS credentials for its startup secret path

#### `is not an allowed role`

Cause:

- Vault DB connection still restricted to static roles

Fix:

- set `allowed_roles="*"`

#### `String ... is too long for user name`

Cause:

- generated DB username exceeded MySQL limits

Fix:

- shorten JIT naming convention

#### DB admin auth fails during `vault write database/config/...`

Cause:

- wrong DB admin password
- or DB admin user not valid from the Vault node source

Fix:

- test DB login directly
- reset the DB admin user if needed

## 26. Production Database Access Operating Model

This section captures the final production operating model based on the nonprod implementation and debugging lessons from this project.

### Final responsibility split

#### DevOps

DevOps should manage only long-lived Vault database connections.

That means:

- add or update DB connection endpoint
- set DB admin username
- set DB admin password
- verify the DB admin user can connect from the Vault node

DevOps should not manage per-request Vault database roles.

#### NPAMX

NPAMX owns the short-lived request lifecycle:

- create a dynamic Vault database role per approved request
- ask Vault to create the JIT DB user
- attach approved DB permissions
- create or assign the IAM Identity Center permission set where needed
- store the Vault lease and generated DB username
- revoke the lease when access ends
- delete the temporary Vault database role from Vault after cleanup

#### Vault

Vault is the control plane for database user lifecycle:

- store DB admin credentials in connection config
- create the JIT DB user
- attach DB permissions
- revoke and delete the user when the lease is revoked

### Why the connection is shared but the role is dynamic

Final working model:

- one Vault database connection per DB endpoint
- one short-lived Vault database role per request

This is required because NPAMX request scope can vary by:

- database
- schema
- table
- access type

So a static shared role per engine is not enough for the current least-privilege model.

## 27. Production Engine Coverage

### RDS family

For MySQL and PostgreSQL style engines:

- DevOps can manage Vault connections from Vault UI
- NPAMX creates dynamic per-request roles
- IAM and password flows are both supported depending on engine/auth profile

### Redshift

Redshift is supported by NPAMX and Vault, but it behaves differently from RDS.

Key differences:

- Vault UI does not fully support managing Redshift connection details
- Redshift does not use the RDS-style `aws rds generate-db-auth-token` flow
- Redshift IAM login uses `aws redshift get-cluster-credentials`

## 28. Vault UI Limitation for Redshift

When opening a Redshift Vault connection in the UI, Vault shows:

- `Database type unavailable`
- `Not supported in the UI`

This is a Vault UI limitation, not an NPAMX issue.

Practical production rule:

- RDS family connections can be managed by DevOps from Vault UI
- Redshift connections must be created or updated by PAM/Vault admins using Vault CLI or API

Do not wait for the UI to support Redshift connection editing.

Use CLI/API for Redshift from day one.

## 29. Vault Policies for Human Operators

### DevOps connection-only policy

Use this policy for DevOps users who should only manage database connections:

```hcl
path "database/config" {
  capabilities = ["list"]
}

path "database/config/*" {
  capabilities = ["create", "read", "update", "list"]
}

path "sys/mounts" {
  capabilities = ["read"]
}

path "sys/mounts/database" {
  capabilities = ["read"]
}

path "sys/internal/ui/mounts/database" {
  capabilities = ["read"]
}

path "sys/internal/ui/mounts/database/*" {
  capabilities = ["read"]
}
```

Recommended policy name:

- `devops-db-connections-only`

Recommended attached policies for a Vault `userpass` DevOps user:

- `default`
- `devops-db-connections-only`

This intentionally does not allow:

- `database/roles/*`
- `database/creds/*`
- `database/rotate-root/*`
- `sys/leases/*`

### Why the old policy was too broad

During nonprod we used a broader DevOps policy that allowed some Vault role visibility and root rotation.

For production, keep DevOps on connection-only access unless there is a separate approved operational need for:

- root rotation
- role inspection
- lease management

## 30. Vault Human Login for Production

### Recommended production direction

Do not rely on Vault `userpass` for normal human users in production.

Recommended production model:

- JumpCloud OIDC for normal human login
- Vault identity group to policy mapping
- JumpCloud MFA on the identity side
- keep `userpass` only as an emergency or bootstrap admin path

### Why

Lessons from nonprod:

- `userpass` passwords are local to Vault
- Vault Community does not provide TOTP self-enrollment in the UI
- admin-managed TOTP enrollment is workable for bootstrap, but not a good steady-state user experience

### TOTP MFA limitation learned in nonprod

Vault Community accepted TOTP MFA method creation, but rejected self-enrollment:

- `enable_self_enrollment is an enterprise only feature`

That means:

- MFA method creation is one-time
- user enrollment is one-time per user
- admin must generate each user’s QR code in Community edition

Production recommendation:

- use JumpCloud OIDC + JumpCloud MFA for standard users
- keep Vault-local `userpass` MFA only for limited break-glass/admin use if needed

## 31. RDS Family Connection Onboarding

### MySQL example

Run on the active Vault node:

```bash
export VAULT_ADDR=https://<vault-internal-dns-or-ip>:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault write database/config/nonprod-mysql \
  plugin_name="mysql-database-plugin" \
  connection_url="{{username}}:{{password}}@tcp(<mysql-endpoint>:3306)/" \
  allowed_roles="*" \
  username="<vault_mysql_admin_user>" \
  password="<vault_mysql_admin_password>" \
  username_template="d-{{.RoleName}}"
```

### PostgreSQL example

```bash
export VAULT_ADDR=https://<vault-internal-dns-or-ip>:8200
export VAULT_CACERT=/opt/vault/tls/vault-ca.pem

vault write database/config/nonprod-postgres \
  plugin_name="postgresql-database-plugin" \
  connection_url="postgresql://{{username}}:{{password}}@<postgres-endpoint>:5432/postgres?sslmode=require" \
  allowed_roles="*" \
  username="<vault_postgres_admin_user>" \
  password="<vault_postgres_admin_password>"
```

### Production rules for RDS-family connections

- `allowed_roles="*"` is required for NPAMX dynamic per-request role creation
- configure the connection only once per endpoint
- do not manually create request-specific Vault DB roles in advance
- validate DB admin login directly from the Vault node if config writes fail

## 32. Redshift Connection Onboarding

### Final Redshift rule

Redshift connections must be managed from CLI or API.

Do not plan Redshift onboarding around Vault UI.

### Working Redshift connection command

Run on the active Vault node:

```bash
export VAULT_ADDR="https://<vault-internal-dns-or-ip>:8200"
export VAULT_CACERT="/opt/vault/tls/vault-ca.pem"

read -s -p "Redshift master password: " REDSHIFT_MASTER_PASSWORD; echo
vault write database/config/nonprod-redshift \
  plugin_name="redshift-database-plugin" \
  allowed_roles="*" \
  connection_url="postgresql://{{username}}:{{password}}@<redshift-endpoint>:5439/dev?sslmode=require" \
  username="<redshift_admin_user>" \
  password="$REDSHIFT_MASTER_PASSWORD" \
  username_template='{{printf "dwh-%s-%s" (.RoleName | truncate 48) (random 6) | truncate 63}}'
unset REDSHIFT_MASTER_PASSWORD
```

Validate:

```bash
vault read database/config/nonprod-redshift
```

### Why the Redshift `username_template` matters

Without an explicit username template, Vault may generate very long usernames like:

- `v-aws-pam--satish.k-0rbcw5nqtto3xjqbxt4y-1774332785`

This works poorly operationally.

The final production naming model for Redshift should be:

- `dwh-<user>-<shortid>`

Example:

- `dwh-satish.korra-a2d7-kdm087`

### Redshift onboarding ownership

Final production split:

- DevOps can own Redshift endpoint/admin credential values
- PAM/Vault admin must apply them to Vault using CLI or API because of Vault UI limitation

## 33. Dynamic Role and Username Naming

### RDS family usernames

Keep MySQL/PostgreSQL usernames short and readable.

Working pattern:

- `d-<requester>-<shortid>`

Example:

- `d-satish-korra-7718`

### Redshift usernames

Use a DWH-specific prefix:

- `dwh-<requester>-<shortid>`

Example:

- `dwh-satish.korra-a2d7-kdm087`

### Operational lesson

Avoid long generated usernames.

This caused issues during nonprod testing and made audit/ops work harder even when creation technically succeeded.

## 34. Final IAM Login Models

### RDS Proxy IAM model

Final working RDS Proxy IAM design:

1. user raises request in NPAMX
2. request is approved
3. Vault creates an IAM-authenticated DB user
4. NPAMX creates and assigns a permission set containing `rds-db:connect`
5. user generates IAM token locally:
   - `aws rds generate-db-auth-token`
6. user connects through the proxy using:
   - proxy endpoint
   - DB username
   - IAM token as password

### Redshift IAM model

Final working Redshift design:

1. user raises request in NPAMX
2. request is approved
3. Vault creates a Redshift DB user
4. Vault grants approved schema/table privileges
5. NPAMX creates and assigns Redshift permission access through IAM Identity Center
6. user generates temporary DB credentials locally:
   - `aws redshift get-cluster-credentials`
7. user connects with the returned `DbUser` and `DbPassword`

### Important difference

Redshift does not use:

- `aws rds generate-db-auth-token`

It uses:

- `aws redshift get-cluster-credentials`

## 35. Redshift Request and Login Validation

### Table must exist in the selected database

During nonprod testing, activation failed when the request used:

- database `mydb`
- schema `public`
- table `test`

but the actual table existed in:

- database `dev`
- schema `public`
- table `test`

Final lesson:

- requested database, schema, and table must exactly match the Redshift object location

Useful validation queries from Redshift admin session:

```sql
SELECT current_database();
```

```sql
SELECT schema_name
FROM information_schema.schemata
ORDER BY schema_name;
```

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
```

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'test';
```

### Final Redshift user command shown in NPAMX

NPAMX should show the user a command block like:

```bash
CREDS_JSON="$(aws redshift get-cluster-credentials \
  --cluster-identifier redshift1 \
  --db-user dwh-satish.korra-a2d7-kdm087 \
  --db-name dev \
  --duration-seconds 900 \
  --region ap-south-1)"

export REDSHIFT_DB_USER="$(printf '%s' "$CREDS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["DbUser"])')"
export REDSHIFT_DB_PASSWORD="$(printf '%s' "$CREDS_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["DbPassword"])')"
printf 'DbUser: %s\n' "$REDSHIFT_DB_USER"
printf 'DbPassword: %s\n' "$REDSHIFT_DB_PASSWORD"
```

Then connect:

```bash
PGPASSWORD="$REDSHIFT_DB_PASSWORD" psql \
  "host=<redshift-endpoint> port=5439 dbname=dev user=$REDSHIFT_DB_USER sslmode=require"
```

### Important Redshift login lesson

`export` commands do not print values by themselves.

During nonprod testing this confused users because:

- variables were set successfully
- terminal showed no username/password output

So the final user instruction block must print:

- `DbUser`
- `DbPassword`

after exporting them.

## 36. Cleanup and Revocation Contract

Final required cleanup behavior after session end, revoke, or expiry:

1. revoke the Vault lease
2. let Vault run revocation SQL and remove DB access
3. delete the temporary Vault DB role
4. clean IAM Identity Center assignment and temporary permission set where applicable

This is the model NPAMX now follows.

### Why this matters

During nonprod testing, dynamic Vault roles accumulated if cleanup deleted the lease but not the Vault role.

Production rule:

- do not leave request-scoped Vault roles behind after revoke/expiry

## 37. Production Validation Checklist

Before calling Vault ready for production database activation, verify all of the following.

### Vault cluster

- Raft healthy
- TLS valid on all nodes
- auto-unseal working
- audit logging enabled
- AppRole login working for NPAMX backend

### Database connections

- each connection exists only once on the active cluster
- `allowed_roles="*"` for NPAMX-managed dynamic role pattern
- DB admin user works from Vault node
- Redshift connection created by CLI/API, not Vault UI

### Human access

- DevOps users have `devops-db-connections-only`
- Vault admins use stronger admin policy set
- JumpCloud OIDC planned or enabled for normal production users
- Vault `userpass` minimized to bootstrap/break-glass use

### NPAMX activation

- approved request creates Vault DB role
- Vault creates DB user
- IAM permission assignment completes
- login details page shows correct engine-specific instructions
- revoke/expiry removes DB user and Vault role

## 38. Final Production Recommendation

Use this operational model going forward:

- DevOps manages RDS-family connections in Vault UI
- PAM/Vault admins manage Redshift connections in Vault CLI/API
- NPAMX creates short-lived Vault roles dynamically per request
- Vault creates and removes JIT DB users
- users authenticate with engine-appropriate IAM flow
- Redshift usernames use `dwh-...`
- RDS family usernames use short `d-...` names
- cleanup must always remove both lease-backed DB access and the temporary Vault role

## 39. DevOps Vault UI SOP for Database Connection Management

This section is the operational SOP for DevOps users who manage long-lived RDS-family Vault database connections from Vault UI.

Use this section for:

- MySQL
- MariaDB
- Aurora MySQL
- PostgreSQL
- Aurora PostgreSQL

Do not use this section for Redshift. Redshift must still be created or updated by PAM/Vault admins through Vault CLI or API.

### 39.1 Purpose

DevOps is responsible only for the long-lived Vault database connection object.

DevOps should:

- create or update the Vault connection
- verify that Vault can reach the database with the configured admin user
- keep the endpoint, port, admin username, and admin password current

DevOps should not:

- create request-specific dynamic Vault roles for users
- pre-create per-user database accounts
- change NPAMX request logic
- manage Redshift from Vault UI

NPAMX will create short-lived request-scoped Vault roles and dynamic DB users automatically after the connection exists and is healthy.

### 39.2 Access Required

DevOps users should log in with:

- JumpCloud OIDC if enabled
- otherwise the approved Vault login method for the environment

Recommended Vault policy set for DevOps users:

- `default`
- `devops-db-connections-only`

The Vault UI URL should be the private internal URL for the environment, for example:

- `https://vault-nonprod.nyk00-int.network/ui`

### 39.3 Inputs DevOps Must Collect Before Opening Vault UI

Before creating a connection, confirm all of the following with the DB owner or platform team:

- database engine
- endpoint or writer endpoint
- port
- database admin username for Vault
- database admin password for Vault
- SSL requirement for the engine
- expected connection name in Vault

Recommended connection naming pattern:

- `<env>-mysql`
- `<env>-postgres`
- `<env>-aurora-mysql`
- `<env>-aurora-postgres`

Examples:

- `nonprod-mysql`
- `prod-postgres`
- `poc-mysql`

### 39.4 Step-by-Step: Open the Database Secrets Engine

1. Log in to Vault UI.
2. Open `Secrets Engines`.
3. Open the `database/` mount used by NPAMX.
4. Open the `Connections` area.
5. Click `Create connection` if this is a new database, or open the existing connection to edit it.

Important:

- do not create a second connection for the same endpoint unless there is an approved reason
- update the existing connection instead of duplicating it

### 39.5 Step-by-Step: Create or Update a MySQL Family Connection

Use this flow for:

- MySQL
- MariaDB
- Aurora MySQL

In Vault UI, fill the connection form with values equivalent to:

- plugin: `mysql-database-plugin`
- connection name: for example `nonprod-mysql`
- connection URL:
  - `{{username}}:{{password}}@tcp(<mysql-endpoint>:3306)/`
- allowed roles:
  - `*`
- admin username:
  - `<vault_mysql_admin_user>`
- admin password:
  - `<vault_mysql_admin_password>`
- username template:
  - `d-{{.RoleName}}`

Operational rules:

- keep `allowed_roles="*"` so NPAMX can create request-scoped dynamic roles
- keep usernames short and readable
- use the writer endpoint where applicable
- do not hardcode requester-specific names in the connection

Before saving:

- enable connection verification if Vault UI provides that option
- confirm the endpoint and port are correct
- confirm the admin user can create and drop users or grant and revoke access as required by your DB model

### 39.6 Step-by-Step: Create or Update a PostgreSQL Family Connection

Use this flow for:

- PostgreSQL
- Aurora PostgreSQL

In Vault UI, fill the connection form with values equivalent to:

- plugin: `postgresql-database-plugin`
- connection name: for example `nonprod-postgres`
- connection URL:
  - `postgresql://{{username}}:{{password}}@<postgres-endpoint>:5432/postgres?sslmode=require`
- allowed roles:
  - `*`
- admin username:
  - `<vault_postgres_admin_user>`
- admin password:
  - `<vault_postgres_admin_password>`

Operational rules:

- keep `allowed_roles="*"` so NPAMX can create request-scoped dynamic roles
- keep SSL enabled where the platform requires it
- use the correct database name in the connection URL, commonly `postgres` for admin connectivity

### 39.7 Save and Immediate Validation in Vault UI

After saving the connection:

1. confirm Vault UI shows the connection without validation errors
2. reopen the saved connection and re-check:
   - plugin
   - endpoint
   - port
   - admin username
   - allowed roles
3. if Vault UI supports `Verify connection`, run it

Expected result:

- Vault accepts the connection
- no authentication error is shown
- no TLS or endpoint error is shown

If save or verification fails:

- re-check the endpoint and port
- re-check the admin username and password
- confirm the DB security group allows Vault node connectivity
- confirm the database admin user has the required privileges

### 39.8 Post-Save Validation in NPAMX

After the connection is saved in Vault UI, DevOps or PAM admins should validate it from NPAMX.

Use both of these validation paths:

#### A. Vault connection validation

In NPAMX:

1. open `Admin`
2. open `Integrations`
3. open `Vault DB Connection Test`
4. click `Refresh Connections`
5. confirm the new Vault connection appears
6. click `Test`

Expected result:

- NPAMX can see the connection from Vault
- NPAMX can mint a short-lived test credential
- the validation returns success for supported engines

#### B. Database user inventory validation

In NPAMX:

1. open `Security`
2. open `DB Users`
3. click `Refresh Connections`
4. select the relevant connection
5. click the scan button

Expected result:

- NPAMX can enumerate DB users for supported engines
- this confirms Vault connection visibility and DB login viability for the audit flow

### 39.9 Redshift Exception

Do not attempt to manage Redshift from Vault UI.

Reason:

- Vault UI does not reliably support Redshift connection editing
- Redshift requires CLI or API onboarding
- Redshift username handling uses a separate `username_template` strategy

For Redshift:

- DevOps provides endpoint and admin credential values
- PAM/Vault admin applies the connection using the commands documented in:
  - `## 32. Redshift Connection Onboarding`

### 39.10 Change Management Rules

When updating an existing connection:

- modify the existing connection object
- do not rename it unless there is an approved migration plan
- do not delete a working connection before the replacement is validated
- notify PAM admins before changing:
  - endpoint
  - port
  - admin username
  - admin password
  - plugin type

If the admin password is rotated:

1. update it in Vault UI immediately
2. save the connection
3. re-run validation in NPAMX

### 39.11 Minimum Troubleshooting Checklist

If the connection does not work, check in this order:

1. correct Vault connection name
2. correct plugin for the engine
3. correct endpoint and port
4. correct admin username and password
5. security group path from Vault nodes to the database
6. SSL requirement in the connection URL
7. `allowed_roles="*"` is still present

Escalate to PAM/Vault admins when:

- Redshift is involved
- Vault UI save fails but the same values need CLI verification
- NPAMX still cannot see the connection after Vault UI save
- dynamic DB user creation fails after connection verification

### 39.12 Completion Criteria

Consider the DevOps task complete only when all of the following are true:

- Vault connection exists and opens cleanly in Vault UI
- verification succeeds or save completes without connection error
- NPAMX `Vault DB Connection Test` can see the connection
- NPAMX test succeeds for supported engines
- if required, `Security` -> `DB Users` can scan the connection

This is the final operational handoff point from DevOps to PAM/NPAMX workflows.
