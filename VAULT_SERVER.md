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

export DB_ADMIN_USER=root
export DB_ADMIN_PASSWORD=YourRootPassword
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

## Admin: Emergency revoke (Database Sessions)

Admins can revoke active database access from **Admin → Database Sessions**: the app calls Vault to revoke the lease and (optionally) delete the dynamic role. **No extra Vault configuration is required.** The token used by the app (`VAULT_TOKEN` or AppRole) must have:

- `sys/leases/revoke` (or a policy that allows revoking leases created by the database engine)
- Delete on `database/roles/<role_name>` for the dynamic roles created by the app

If the app already creates dynamic DB roles and issues credentials, the same token typically has these capabilities. If revoke fails with permission denied, add a policy that allows `sys/leases/revoke` and `database/roles/*` delete.
