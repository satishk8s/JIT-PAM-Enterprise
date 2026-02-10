# Database Access Proxy (standalone)

This folder contains everything needed to run the **Database Access Proxy** on its own EC2.

- **database_proxy.py** – Flask app; `/health` and `/execute` (L1/L2/L3 enforcement).
- **sql_enforcer.py** – Role-based SQL rules (L1=read, L2=read+insert/update, L3=delete+DDL).
- **database_manager.py** – Runs queries against MySQL (PyMySQL).
- **requirements.txt** – Flask, Flask-CORS, PyMySQL only.

**Setup:** See **docs/PROXY_SERVER_SETUP.md** for step-by-step instructions on the proxy EC2.

**Run (on proxy server):**
```bash
cd /opt/db-proxy
source venv/bin/activate
export DB_PROXY_HOST=0.0.0.0
export DB_PROXY_PORT=5002
python3 database_proxy.py
```

**Systemd:** Copy `db-proxy.service` to `/etc/systemd/system/` on the proxy EC2 (path in the unit is `/opt/db-proxy`).
