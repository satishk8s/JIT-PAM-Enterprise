# NPAMX Vault Dynamic Database Access (JIT) - Project Document

Last updated: 2026-02-13

## 1) Executive Summary (Plain English)

We changed NPAMX database access so users never get long-lived credentials and do not need to share passwords.

Now, a database access request works like this:

1. A user selects account, engine, instance, database(s), SQL operations, duration (TTL), and justification.
2. The request goes through approvals (Manager / DB Owner / CISO) based on environment and data sensitivity.
3. Once approvals are complete, the backend calls HashiCorp Vault (Database Secrets Engine) to mint:
   - A short-lived DB username (traceable to the requester)
   - A short-lived DB password (password-mode only)
   - A Vault lease that expires automatically at TTL
   - If IAM auth is used, Vault creates the DB user and grants, but NPAMX generates an IAM token on demand (no password is shown/stored).
4. NPAMX shows the user only the DB proxy endpoint (never the real DB endpoint) and two ways to connect:
   - PAM Terminal (browser-based query terminal)
   - External tool credentials (DBeaver / Workbench) via proxy host/port
5. When TTL expires, Vault revokes automatically; NPAMX marks the request as expired and clears secrets.

## 2) Before vs After

### Before

- DB credentials were created at request time (or approval time) by directly connecting as a DB admin user.
- Requests were persisted in a JSON file (`backend/data/requests.json`).
- UI responses could include the real RDS endpoint (host/port).
- Background cleanup used DB admin credentials to drop users (manual cleanup approach).

### After

- Requests are created as `pending`. TTL does not start until the request becomes active.
- Persistence is in SQLite (no JSON file writes):
  - `requests`, `db_sessions`, `approvals`, `audit_logs`
- After final approval, backend activates the request by minting a Vault lease:
  - `db_username` (dynamic, includes requester identity)
  - `password` (dynamic DB password, password-mode only)
  - `lease_id` and `vault_role_name`
  - `expiry_time`
- UI never displays the real DB endpoint. It displays only the configured proxy endpoint.
- Cleanup no longer drops users directly; Vault handles revocation via TTL. NPAMX only marks the request expired and clears stored secrets.
- Activation failures do not "fail" the request permanently: the request stays `approved` so operators/users can retry activation.

## 3) Security Principles Enforced

- Users never need to share credentials in chat or forms.
- Frontend never receives DB admin credentials.
- Backend never returns the Vault service token (AppRole/service token) to users.
- Users never see the real DB endpoint in "My Requests" or request details.
- Credentials are only retrievable for:
  - The request owner
  - An active (non-expired) request

## 4) Key Backend Changes

### 4.1 Activation After Approval (Vault Session Creation)

Activation is centralized in:

`backend/app.py`:

```python
def _activate_database_access_request(request_id: str) -> dict:
    ...
    vault_creds = VaultManager.create_database_session(
        request_id=rid,
        engine=engine,
        db_names=db_names,
        allowed_ops=allowed_ops,
        duration_hours=duration_hours,
        requester=req.get("user_email") or "",
        auth_type=("iam" if effective_auth == "iam" else "password"),
    )
    req['role_name'] = vault_creds.get('vault_role_name', '')
    req['lease_id'] = vault_creds.get('lease_id', '')
    req['password'] = vault_creds.get('vault_token', '')
    req['db_username'] = vault_creds.get('db_username', '')
    req['expiry_time'] = vault_creds.get('expires_at') or ...
    req['status'] = 'ACTIVE'
```

### 4.2 Traceable DB Usernames (Requester + Request ID)

Goal:
- DB usernames must be traceable to the requester.

Implementation:
- Vault role creation sets `username_template` so the generated DB user looks like:
  - `D-jit_<user>-<rid>-<rand>`

`backend/vault_manager.py`:

```python
body={
  "db_name": connection,
  "creation_statements": creation_statements,
  "revocation_statements": revocation_statements,
  "username_template": VaultManager._username_template_for(
      requester=requester, request_id=rid, engine=engine_l
  ),
  "default_ttl": f"{duration_hours}h",
  "max_ttl": f"{duration_hours}h",
}
```

Notes:
- MySQL usernames are limited to 32 chars, so NPAMX truncates the template safely.
- A small random suffix is included to avoid collisions if credentials are minted more than once.
- Some Vault versions generate usernames using a **connection-level** template (and ignore role-level templates).
  If you still see usernames like `v-approle-...`, set the database connection `username_template` in Vault:

```bash
# Run on the Vault server. Use your real connection name (default in NPAMX: "my-mysql").
# IMPORTANT: When writing database/config, include your existing config fields (plugin_name, connection_url, allowed_roles, etc.)
# to avoid overwriting them.
vault write database/config/my-mysql \
  username_template="D-{{.RoleName}}-{{random 4}}"
```

### 4.2 Approval Hook Calls Activation

`backend/app.py`:

```python
@app.route('/api/approve/<request_id>', methods=['POST'])
def approve_request(request_id):
    ...
    if required.issubset(received):
        activate_result = _activate_database_access_request(request_id)
        ...
```

### 4.3 User-Facing Credentials Endpoint (Owner-Only)

`backend/app.py`:

```python
@app.route('/api/databases/request/<request_id>/credentials', methods=['GET'])
def get_database_request_credentials(request_id):
    # owner-only + active-only + not-expired
    return jsonify({
        "proxy_host": proxy_host,
        "proxy_port": proxy_port,
        "db_username": username,
        "password": password,
        "expiry_time": req["expiry_time"],
    })
```

### 4.4 No DB Endpoint Exposure

We sanitize DB requests before returning them via:

`backend/app.py`:

```python
def _sanitize_database_request_for_client(req: dict) -> dict:
    proxy_host, proxy_port = _resolve_db_connect_proxy_endpoint()
    safe.pop("db_password", None)
    safe.pop("password", None)
    safe.pop("vault_token", None)  # legacy field
    safe["databases"] = [{"host": proxy_host, "port": proxy_port, ...} for ...]
    return safe
```

This is applied to:
- `GET /api/request/<id>`
- `GET /api/requests`
- `GET /api/databases/requests`
- `GET /api/databases/approved`

### 4.5 Cleanup: Mark Expired + Clear Secrets (Vault TTL Does Revocation)

`backend/app.py`:

```python
# Background cleanup:
if expires_at <= now:
    lease_id = access_request.get("lease_id", "")
    if lease_id:
        VaultManager.revoke_lease(lease_id)  # best-effort; TTL handles it anyway
    access_request["status"] = "EXPIRED"
    access_request["password"] = ""
    access_request["vault_token"] = ""  # legacy field
    access_request["db_password"] = ""  # legacy field
    VaultManager.delete_database_role(access_request["role_name"])  # optional
```

## 5) Vault Integration Details

Vault client is implemented with stdlib HTTP (no `hvac` dependency):

`backend/vault_manager.py`

### 5.1 AppRole Login (Required)

Vault backend authentication:
- `VAULT_ROLE_ID`
- `VAULT_SECRET_ID`

### 5.2 Dynamic Role + Dynamic User

Per request, NPAMX creates a Vault DB role and mints one set of credentials.

MySQL grants are built from the structured operations list (least-privilege mapping).

Example (simplified):

```python
creation_statements = [
  "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
  "GRANT SELECT, INSERT ON `mydb`.* TO '{{name}}'@'%';",
  "FLUSH PRIVILEGES;"
]
```

### 5.3 IAM Database Authentication (Optional)

If the selected RDS instance has IAM DB authentication enabled and the request uses IAM mode:
- Vault creates the DB user using the IAM auth plugin (no password is required/used).
- NPAMX generates the IAM token on demand (valid ~15 minutes).

MySQL IAM creation (simplified):

```python
"CREATE USER '{{name}}'@'%' IDENTIFIED WITH AWSAuthenticationPlugin as 'RDS';"
```

Token generation (server-side only):

```python
tok = rds.generate_db_auth_token(
  DBHostname=rds_endpoint,
  Port=rds_port,
  DBUsername=db_username,
  Region=region,
)
```

## 6) Frontend Changes

### 6.0 No RDS Endpoint Collection (Strict)

The database selection wizard no longer collects or displays the real RDS endpoint.

- Instance selection uses `DBInstanceIdentifier` + metadata only.
- Manual fallback is `RDS Instance ID` (and optional region), not a hostname.
- All user-facing screens show only the configured **proxy** host/port.

## 7) EC2 Deployment Notes (Vault/Proxy Env)

If you run the backend via `systemd` (recommended), exporting variables in an SSH session will NOT reach the service.

Use an env file:
- Path: `/etc/npamx/npamx.env`
- Permissions: `chmod 600 /etc/npamx/npamx.env`
- Example template in repo: `scripts/npamx.env.example`

Required variables for Vault dynamic DB access:
- `VAULT_ADDR`
- `VAULT_ROLE_ID`
- `VAULT_SECRET_ID`

Required variables for proxy-only connectivity:
- `DB_CONNECT_PROXY_HOST`
- `DB_CONNECT_PROXY_PORT`

SQLite persistence (optional override):
- `NPAMX_DB_PATH` (default: `backend/data/npamx.db`)

IAM token/TLS (optional):
- `DB_SSL_CA_BUNDLE` path to an RDS CA bundle (recommended for IAM auth)
- `DB_SSL_REQUIRE=true` to force TLS even without an explicit CA path (use with care)

Troubleshooting (operator-only):
- If activation fails, NPAMX returns a generic error to the browser.
- The full internal error is logged to `journalctl -u npam-backend` and stored in SQLite (`requests.payload_json.activation_error`).

### 6.1 Approved Databases Actions

In "My Requests > Databases", approved items now show:
- `PAM Terminal` button (browser terminal)
- `External Tool` button (opens modal and fetches credentials securely)

`frontend/databases.js`:

```javascript
<button class="btn-primary btn-sm" onclick="connectToDatabase(...)">PAM Terminal</button>
<button class="btn-secondary btn-sm" onclick="openDbExternalToolModal(requestId)">External Tool</button>
```

### 6.2 External Tool Modal

The modal calls:

`GET /api/databases/request/<request_id>/credentials?user_email=<user>`

and displays:
- Proxy host/port
- Database name
- Username
- Vault token (as password), masked by default with Show/Copy actions

## 7) Configuration (Environment Variables)

Backend:
- `VAULT_ADDR`
- `VAULT_NAMESPACE` (optional)
- `VAULT_ROLE_ID` and `VAULT_SECRET_ID` (required)
- `VAULT_DB_MOUNT` (default `database`)
- `VAULT_DB_CONNECTION_NAME` (default `my-mysql`)
- `INTERNAL_API_TOKEN` (required for internal `/vault/create-db-session`)

Proxy endpoint shown to users (never real DB endpoint):
- `DB_CONNECT_PROXY_HOST`
- `DB_CONNECT_PROXY_PORT`

Fallbacks:
- `DB_PROXY_HOST`
- `DB_PROXY_PORT`
- `DB_PROXY_URL`

## 8) What’s Next (Not Implemented Yet)

- Network DB proxy enforcement that validates Vault lease/token before routing.
- IAM-auth-only flow that provisions DB users/roles via Vault (no password) and uses IAM DB tokens for external clients.
- Stronger RBAC for approvals (real manager/db owner/ciso identities instead of admin prompt selection).
- Per-database approvals and multi-database Vault templates across engines beyond MySQL/Postgres.
