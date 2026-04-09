## Vault DB Inventory Helper

This helper is meant to run on the Vault host or in the same private network zone as Vault and the databases.

It allows NPAMX to request database-user inventory without giving NPAMX direct network access to the databases.

### What it does

1. Receives an internal batch request from NPAMX.
2. Uses Vault to obtain either:
   - a fixed static audit role, or
   - a temporary dynamic audit role as fallback
3. Connects to each database from the Vault network zone.
4. Returns sanitized user inventory JSON to NPAMX.
5. Revokes and deletes temporary dynamic audit roles after the fetch.

### Required environment variables

- `VAULT_DB_HELPER_SHARED_TOKEN`
  or
- `VAULT_DB_HELPER_SHARED_TOKEN_SECRET_NAME`

Optional:

- `VAULT_DB_HELPER_PORT`
- `VAULT_DB_HELPER_HOST`
- `VAULT_DB_HELPER_MAX_WORKERS`

The helper also uses the existing Vault environment variables already required by `vault_manager.py`, for example:

- `VAULT_ADDR_NONPROD`
- `VAULT_AUTH_METHOD_NONPROD`
- `VAULT_AWS_ROLE_NONPROD`
- `VAULT_DB_MOUNT_NONPROD`

### Run locally on the Vault host

```bash
cd /opt/npamx/app/backend
python3 -m uvicorn vault_db_inventory_helper:app --host 0.0.0.0 --port 8011
```

### Recommended systemd service

```ini
[Unit]
Description=NPAMX Vault DB Inventory Helper
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/npamx/app/backend
Environment=VAULT_DB_HELPER_PORT=8011
ExecStart=/opt/npamx/app/backend/venv/bin/python -m uvicorn vault_db_inventory_helper:app --host 0.0.0.0 --port 8011
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### NPAMX backend configuration

Set on NPAMX:

- `VAULT_DB_HELPER_URL_NONPROD=http://<vault-private-ip>:8011`
- `VAULT_DB_HELPER_SHARED_TOKEN=<same token as helper>`

Optional:

- `VAULT_DB_HELPER_TIMEOUT_SEC_NONPROD=180`

### Security notes

- Restrict network access to the helper port so only NPAMX backend can reach it.
- Use a strong shared token and store it in Secrets Manager where possible.
- Do not expose this helper publicly.
