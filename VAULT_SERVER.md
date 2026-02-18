# Steps: All-in-One Server (Vault + DB + Proxy + App)

**Server:** One machine with Vault (dev) already running. Add MySQL, Proxy, and App on same server.

---

## Ports

| Service | Port |
|---------|------|
| Vault | 8200 |
| MySQL | 3306 |
| Proxy | 5002 |
| Flask | 5000 |

---

## Step 1: Vault is Running

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<your-dev-root-token>'
vault status
```

---

## Step 2: MySQL on Same Server

```bash
sudo yum install -y mariadb105-server
sudo systemctl start mariadb
sudo systemctl enable mariadb
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY 'YourRootPassword';"
sudo mysql -u root -p -e "CREATE USER 'admin'@'%' IDENTIFIED BY 'admin123'; GRANT ALL ON *.* TO 'admin'@'%'; FLUSH PRIVILEGES;"
```

---

## Step 3: Configure Vault MySQL Plugin

```bash
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<your-dev-root-token>'

vault secrets enable database
vault write database/config/mysql \
    plugin_name=mysql-database-plugin \
    connection_url="{{username}}:{{password}}@tcp(127.0.0.1:3306)/" \
    allowed_roles="jit-*" \
    username_template="D-{{.RoleName}}-{{random 4}}" \
    username="root" \
    password="YourRootPassword"

vault write database/roles/jit-read-role \
    db_name=mysql \
    creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT ON *.* TO '{{name}}'@'%';" \
    default_ttl="2h" \
    max_ttl="2h"
```

---

## Step 4: App + Dependencies

```bash
cd /root/JIT-PAM-Enterprise
git pull origin main
sudo ./scripts/fix-ec2-deploy.sh   # if blocks

cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install hvac
```

---

## Step 5: Start Proxy and Flask

```bash
cd /root/JIT-PAM-Enterprise/backend
source venv/bin/activate

export USE_DB_PROXY=true
export DB_PROXY_URL=http://127.0.0.1:5002
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=<your-dev-root-token>

./run-backend-on-ec2.sh
```

---

## Step 6: Verify

```bash
curl -s http://127.0.0.1:5002/health
curl -s http://127.0.0.1:5000/api/health
```

---

## Checklist

- [ ] Vault on 8200, MySQL on 3306
- [ ] `database/config/mysql`, `database/roles/jit-read-role` in Vault
- [ ] Proxy 5002, Flask 5000
- [ ] `USE_DB_PROXY=true`, `VAULT_ADDR`, `VAULT_TOKEN` set

---

## Database access: IAM-based authentication (additional path)

Alongside Vault password and Vault IAM (AWSAuthenticationPlugin) flows, the app supports **IAM permission set**–based DB access when the user chooses IAM auth:

1. **On approval/activation (IAM auth):**  
   - Vault still creates the DB user (IAM plugin) and grants.  
   - The app also creates an **AWS SSO permission set** whose name is derived from the requester and request (e.g. `NPAMX_DB_<account>_<user>_<reqid>`).  
   - The permission set’s **inline policy** allows `rds-db:connect` for the requested **RDS DB resource** and **DB username** (resource ARN: `arn:aws:rds-db:<region>:<account>:dbuser:<resource-id>/<db_username>`).  
   - The permission set is **assigned** to the requesting user and the target AWS account.

2. **Token in the app:**  
   The app continues to generate the IAM DB auth token using its own credentials (same as today) and shows it under the user’s profile (Credentials / External Tool). No change to existing behaviour.

3. **Generate token on your machine:**  
   If the user prefers not to use the app-generated token, the UI shows a collapsible **“Generate IAM token on your machine”** section with:  
   - Configure AWS credentials (e.g. `aws sso login` or access key).  
   - Run: `aws rds generate-db-auth-token --hostname <rds-endpoint> --port <port> --username <db_username> --region <region>`.  
   - Use the command output as the password when connecting (host/port as shown in NPAMX).

Existing Vault-only (password and IAM) behaviour is unchanged.

---

## Admin: Emergency revoke (Database Sessions)

Admins can revoke active database access from **Admin → Database Sessions**. The app stores the **full lease_id** returned by Vault (e.g. `database/creds/jit_satish-6aa386ef/dfthU8XSCELjomCDym8Y5HTp`) and revokes only via:

- `vault lease revoke <FULL_LEASE_ID>` (HTTP: `POST /v1/sys/leases/revoke` with `{"lease_id": "..."}`)

The app does **not** revoke by role name. Session records store `lease_id` (full string), `role_name`, and `db_username`. Revoke workflow: call Vault lease revoke with the full `lease_id` → verify success → then mark the session revoked and remove it from the PAM UI. **Vault owns lifecycle:** when the lease is revoked, Vault runs the role’s `revocation_statements` (e.g. `DROP USER` in MySQL). No direct MySQL DROP USER in the app.

**Token must allow lease revoke.** The app token (e.g. from AppRole) must have permission to revoke leases. If you see `Vault HTTP 403: permission denied` when clicking "Revoke selected", add a policy and attach it to the app's token/role:

```hcl
# Allow revoking leases (e.g. database credential leases)
path "sys/leases/revoke" {
  capabilities = ["update"]
}
```

Or with a policy name, e.g. `npamx-revoke`:

```bash
vault policy write npamx-revoke - <<EOF
path "sys/leases/revoke" {
  capabilities = ["update"]
}
EOF
# Attach to the AppRole used by the app (add npamx-revoke to the role's token_policies).
```

Until this is set, the app will still **mark the session as revoked in the PAM UI** (session disappears) when you click revoke, but Vault will not run revocation_statements (e.g. DROP USER). Fix the policy so future revokes also revoke the lease in Vault.
