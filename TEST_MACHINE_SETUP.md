# Test Machine Setup: DB + Proxy + Vault

**Goal:** One machine with MySQL, Database Proxy, and HashiCorp Vault for end-to-end testing.  
**Order:** Proxy first → Vault second → AI & Guardrails later.

---

## Architecture (Test Machine)

```
[Browser] → Nginx → Flask (5000) → Proxy (5002) → MySQL (3306)
                         ↓
                    Vault (8200)  ← credentials on approve
```

- **Flask**: Receives requests, approves DB access, creates credentials (Vault or direct), forwards queries to Proxy
- **Proxy**: Single enforcement point. Validates SQL, executes against MySQL. Never exposed to internet.
- **Vault**: Optional. When configured, generates dynamic DB credentials with TTL. Fallback: direct MySQL user creation.

---

## Phase 1: Proxy (Start Here)

### 1.1 Prerequisites (same machine)
- MySQL 5.7+ or 8.0
- Python 3.8+
- Flask, pymysql, flask-cors

### 1.2 Start Proxy
```bash
cd /root/JIT-PAM-Enterprise/backend
export USE_DB_PROXY=true
export DB_PROXY_URL=http://127.0.0.1:5002

# Terminal 1: Proxy
python3 database_proxy.py

# Terminal 2: Flask
python3 app.py
```

### 1.3 Verify
```bash
curl -s http://127.0.0.1:5002/health
# Expect: {"status":"ok","service":"database-proxy"}
```

### 1.4 Test Flow
1. Request DB access in UI
2. Approve
3. Connect and run `SELECT 1`
4. Try `CREATE TABLE` → should be blocked (unless role allows)

---

## Phase 2: Vault

### 2.1 Install Vault (dev mode for testing)
```bash
# Amazon Linux 2
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
sudo yum install -y vault

# Or download binary from https://developer.hashicorp.com/vault/downloads
```

### 2.2 Start Vault (dev mode - NOT for production)
```bash
vault server -dev
# Note: Root Token and Unseal Key printed. Use Root Token as VAULT_TOKEN.
# In another terminal:
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='<root-token-from-output>'
vault status
```

### 2.3 Enable MySQL Database Plugin
```bash
vault secrets enable database

vault write database/config/mysql \
    plugin_name=mysql-database-plugin \
    connection_url="{{username}}:{{password}}@tcp(127.0.0.1:3306)/" \
    allowed_roles="jit-*" \
    username="root" \
    password="YOUR_MYSQL_ROOT_PASSWORD"
```

### 2.4 Create Role Template
```bash
vault write database/roles/jit-read-role \
    db_name=mysql \
    creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}'; GRANT SELECT ON *.* TO '{{name}}'@'%';" \
    default_ttl="2h" \
    max_ttl="2h"
```

### 2.5 App Config
```bash
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=<root-token>
```

### 2.6 VaultManager Notes
Current `vault_manager.py` creates roles dynamically (`jit-{username}-{db_name}`). May need to align with a generic role or adjust for Vault's database plugin API.

---

## Phase 3: Run All Together

### systemd (optional)
```ini
# /etc/systemd/system/npam-proxy.service
[Unit]
Description=NPAM Database Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/JIT-PAM-Enterprise/backend
ExecStart=/usr/bin/python3 database_proxy.py
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Checklist

- [ ] MySQL running, DB_ADMIN_USER/DB_ADMIN_PASSWORD set
- [ ] Proxy starts, health returns OK
- [ ] Flask USE_DB_PROXY=true, forwards to proxy
- [ ] End-to-end: approve → connect → query works
- [ ] Vault installed, dev mode
- [ ] Vault database plugin configured for MySQL
- [ ] VAULT_ADDR, VAULT_TOKEN set for Flask
- [ ] Approve creates credentials via Vault (or fallback works)

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Proxy unreachable | `curl http://127.0.0.1:5002/health` |
| Flask falls back to direct | `USE_DB_PROXY=true`, `DB_PROXY_URL` correct |
| Vault returns None | `vault status`, database plugin enabled, role exists |
| MySQL connection refused | `mysql -h 127.0.0.1 -u root -p` |
