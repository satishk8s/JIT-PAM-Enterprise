# Deploy NPAMX on Ubuntu 24 — Full commands

- **Break-glass users:** login with **username and password** (emergency admin).
- **All other users:** login through **AWS IAM Identity Center** (SSO).

Use `https://npamx.nyk00-int.network` as the public PAM URL anywhere this guide refers to `YOUR_EC2_IP` or `YOUR_DOMAIN`.

---

## Commands from the beginning (run in order)

Code is in a repo; you push from your machine and **pull on EC2**. No SCP or zip. All commands below run **on the Ubuntu 24 EC2** (SSH in as `ubuntu` or your admin user).

Replace `YOUR_REPO_URL` (e.g. `https://github.com/your-org/sso.git` or `git@github.com:your-org/sso.git`) and other placeholders. For this environment, use `https://npamx.nyk00-int.network` as the public PAM URL. For a **private repo**, either use an HTTPS URL with a personal access token, or configure an SSH key on the EC2 for `git@...` URLs.

```bash
# 1) System update and packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx git

# 2) App dir and user
sudo useradd -r -s /bin/false npamx 2>/dev/null || true
sudo mkdir -p /opt/npamx
sudo chown npamx:npamx /opt/npamx

# 3) Clone repo (use branch name if not main)
sudo git clone YOUR_REPO_URL /opt/npamx/app
sudo chown -R npamx:npamx /opt/npamx/app
# Later, to deploy updates: cd /opt/npamx/app && sudo git pull && sudo chown -R npamx:npamx /opt/npamx/app && sudo systemctl restart npamx

# 4) Python venv and deps
cd /opt/npamx/app/backend
sudo -u npamx python3 -m venv venv
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install --upgrade pip
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install -r /opt/npamx/app/backend/requirements.txt

# 5) Create .env (then edit: nano /opt/npamx/app/backend/.env)
SECRET=$(openssl rand -hex 32)
sudo -u npamx tee /opt/npamx/app/backend/.env << ENVEOF
FLASK_ENV=production
FLASK_SECRET_KEY=$SECRET
PORT=5000
CORS_ORIGINS=https://npamx.nyk00-int.network
APP_BASE_URL=https://npamx.nyk00-int.network
PAM_SUPER_ADMIN_SEED_EMAIL=break-glass-admin@yourcompany.com
SSO_INSTANCE_ARN=arn:aws:sso:::instance/ssoins-XXXXXXXX
IDENTITY_STORE_ID=d-XXXXXXXXXXXXXXXXX
SSO_START_URL=https://your-org.awsapps.com/start
ENVEOF

# 6) Systemd service
sudo tee /etc/systemd/system/npamx.service << 'SVCEOF'
[Unit]
Description=NPAMX JIT PAM (Flask)
After=network.target
[Service]
Type=simple
User=npamx
Group=npamx
WorkingDirectory=/opt/npamx/app/backend
EnvironmentFile=/opt/npamx/app/backend/.env
ExecStart=/opt/npamx/app/backend/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 120 "app:app"
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
SVCEOF
sudo systemctl daemon-reload
sudo systemctl enable npamx
sudo systemctl start npamx

# 7) Nginx
sudo tee /etc/nginx/sites-available/npamx << 'NGXEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /opt/npamx/app/frontend;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
    location /saml/ {
        proxy_pass http://127.0.0.1:5000/saml/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /login {
        proxy_pass http://127.0.0.1:5000/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGXEOF
sudo ln -sf /etc/nginx/sites-available/npamx /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
```

Then:

1. **Edit .env** with your real values:  
   `sudo -u npamx nano /opt/npamx/app/backend/.env`  
   Set the PAM URL to `https://npamx.nyk00-int.network`, plus the break-glass email and SSO ARN / Identity Store ID / start URL.
2. **Create the break-glass user** (full-access admin; they will assign IdC users as admins/roles):  
   `cd /opt/npamx/app/backend && sudo -u npamx python3 add_break_glass_user.py`  
   Enter email and password when prompted. This user logs in with **Login with Password** and has full access.
3. **Bootstrap PAM admins** (optional; for SSO users who should see Admin panel):  
   `sudo mkdir -p /opt/npamx/app/backend/data && sudo chown npamx:npamx /opt/npamx/app/backend/data`  
   Then: `echo '{"pam_admins":[{"email":"sso-admin@company.com","role":"SuperAdmin"}]}' | sudo -u npamx tee /opt/npamx/app/backend/data/pam_admins.json`  
   Restart: `sudo systemctl restart npamx`.
4. **Security group:** allow inbound HTTP (port 80) from `0.0.0.0/0` (or your IP).
5. Open **https://npamx.nyk00-int.network** — **Login with Password** = break-glass (full access). **Login with SSO** = Identity Center users. Break-glass user can add IdC users as admins/roles from Admin panel.

---

## 1. SSH and system update (Ubuntu 24)

```bash
# From your laptop: connect to EC2 (use your key and IP)
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# On EC2: update and install packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx git
```

---

## 2. App directory and user

```bash
sudo useradd -r -s /bin/false npamx 2>/dev/null || true
sudo mkdir -p /opt/npamx/app
sudo chown -R npamx:npamx /opt/npamx
```

---

## 3. Clone the project on EC2 (from your repo)

Push your code to the repo from your Mac (or CI); on EC2 you clone or pull.

**First-time clone on EC2** (replace `YOUR_REPO_URL`; use `main` or your branch):

```bash
sudo git clone YOUR_REPO_URL /opt/npamx/app
sudo chown -R npamx:npamx /opt/npamx/app
```

**Later: deploy updates** (after you push to the repo):

```bash
cd /opt/npamx/app
sudo git pull
sudo chown -R npamx:npamx /opt/npamx/app
sudo systemctl restart npamx
```

For a **private repo**, use an HTTPS URL with a personal access token, or configure an SSH key on the EC2 for `git@...` URLs.

---

## 4. Python virtualenv and dependencies

```bash
cd /opt/npamx/app/backend
sudo -u npamx python3 -m venv venv
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install --upgrade pip
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install -r /opt/npamx/app/backend/requirements.txt
```

---

## 5. Production .env (break-glass + Identity Center)

Break-glass uses env for the seed admin. Everyone else uses AWS Identity Center (SSO).

**Generate a secret key (run once on EC2):**

```bash
openssl rand -hex 32
```

**Create the env file** (replace `YOUR_SECRET_KEY` and AWS/SSO values):

```bash
sudo -u npamx tee /opt/npamx/app/backend/.env << 'EOF'
# === Required for production ===
FLASK_ENV=production
FLASK_SECRET_KEY=YOUR_SECRET_KEY
PORT=5000

# Frontend URL (CORS)
CORS_ORIGINS=https://npamx.nyk00-int.network

# Base URL of this app (for SAML ACS callback and audience)
APP_BASE_URL=https://npamx.nyk00-int.network

# === Break-glass: only this user can log in with username/password ===
# Set to the email of your emergency admin (e.g. super-admin@company.com)
PAM_SUPER_ADMIN_SEED_EMAIL=break-glass-admin@yourcompany.com

# Optional: break-glass from Secrets Manager instead of env
# PAM_BREAK_GLASS_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name

# === AWS IAM Identity Center (all other users log in via SSO) ===
SSO_INSTANCE_ARN=arn:aws:sso:::instance/ssoins-XXXXXXXX
IDENTITY_STORE_ID=d-XXXXXXXXXXXXXXXXX
SSO_START_URL=https://your-org.awsapps.com/start

# Optional: if app runs in same account as Identity Center, leave unset.
# If app runs in another account, set the role to assume for IdC APIs:
# IDC_ASSUME_ROLE_ARN=arn:aws:iam::MANAGEMENT_ACCOUNT_ID:role/YourIdCRole
# IDC_ASSUME_ROLE_SESSION_NAME=npam-idc
EOF
```

**Edit the file to set your real values:**

```bash
sudo -u npamx nano /opt/npamx/app/backend/.env
```

Set at least:

- `FLASK_SECRET_KEY` (paste the output of `openssl rand -hex 32`)
- `CORS_ORIGINS=https://npamx.nyk00-int.network`
- `APP_BASE_URL=https://npamx.nyk00-int.network`
- `PAM_SUPER_ADMIN_SEED_EMAIL` (break-glass admin email)
- `SSO_INSTANCE_ARN`, `IDENTITY_STORE_ID`, `SSO_START_URL` (from your AWS IAM Identity Center / SSO setup)

---

## 5b. Bootstrap PAM admins (so Admin panel shows after login)

**You do not need a separate database for admin users.** The app stores PAM admins (who see the Admin panel) in a JSON file: `backend/data/pam_admins.json`. The break-glass seed from `.env` (`PAM_SUPER_ADMIN_SEED_EMAIL`) is always treated as a SuperAdmin in memory, but creating the file with that email ensures the list persists and the Admin panel shows.

- **Break-glass users** = admins who can log in with username/password (when that flow is enabled); their email is the seed in `.env`.
- **Other users** = log in via **AWS Identity Center (SSO)**. To let an SSO user see the Admin panel, add their email to the PAM admins list (via Admin → Users & Groups after first admin is in, or by adding it to the file below).

**On EC2, after editing `.env` with your real `PAM_SUPER_ADMIN_SEED_EMAIL` (for example, `admin@example.com`):**

```bash
# Create data dir and initial PAM admins file (use the same email as PAM_SUPER_ADMIN_SEED_EMAIL)
sudo mkdir -p /opt/npamx/app/backend/data
sudo chown npamx:npamx /opt/npamx/app/backend/data

# Replace YOUR_ADMIN_EMAIL with the break-glass/SSO admin email (for example, admin@example.com)
ADMIN_EMAIL="YOUR_ADMIN_EMAIL"
echo '{"pam_admins":[{"email":"'$ADMIN_EMAIL'","role":"SuperAdmin"}]}' | sudo -u npamx tee /opt/npamx/app/backend/data/pam_admins.json
```

Then restart the app: `sudo systemctl restart npamx`.

**Why the Admin panel might not show:**

1. **Session** – You must complete **SSO login** (SAML) so the backend has a session. The frontend then calls `/api/admin/check-pam-admin`; if there is no session (e.g. you used a dev “quick login” that doesn’t hit the backend), the API returns 401 and the panel stays hidden.
2. **Email match** – The email the app resolves from your SSO session (SAML/Identity Center) must match an email in the PAM admins list (file + seed). Use the **exact** email you get from Identity Center in `PAM_SUPER_ADMIN_SEED_EMAIL` and in `pam_admins.json`.
3. **File/dir** – Ensure `backend/data/pam_admins.json` exists and is readable by the `npamx` user.

**Check what the backend sees after SSO login:**  
Open (in the same browser where you’re logged in):  
`https://YOUR_APP_URL/api/saml/profile`  
or  
`https://YOUR_APP_URL/api/admin/check-pam-admin`  
You should see JSON with `email` and `is_admin` / `isAdmin`. If `email` is wrong or empty, fix Identity Center/SAML attributes or add that resolved email to `pam_admins.json`.

**Optional: add more SSO admins later** – After the first admin logs in, they can open **Admin → Users & Groups** and add other Identity Center users as PAM admins (stored in the same JSON file).

---

## 5c. Create break-glass user manually (on EC2)

**Break-glass users** are created **manually on the EC2** and stored in a small SQLite DB under `backend/data/`. They log in with **username (email) + password** and have **full access** to the solution. They then assign **Identity Center (SSO) users** as admins and other roles from the Admin panel.

**One-time setup on EC2:** create the first break-glass user (use a dedicated admin email, e.g. `pam-admin@yourcompany.com`):

```bash
cd /opt/npamx/app/backend
sudo -u npamx python3 add_break_glass_user.py
```

When prompted, enter the break-glass **email** and **password** (min 8 characters). The user is stored in `backend/data/npamx_break_glass.db`.

**Non-interactive (e.g. from env):**

```bash
cd /opt/npamx/app/backend
sudo -u npamx EMAIL=pam-admin@yourcompany.com PASSWORD='your-secure-password' python3 add_break_glass_user.py
```

**After that:**

- Users open the app → **Login with Password** → enter that **email** and **password**.
- The break-glass user gets full access and sees the **Admin** panel.
- From **Admin → Users & Groups** they add **Identity Center (SSO) users** as PAM admins or other roles; those users then log in via **Login with SSO** (Identity Center).

No separate database beyond this SQLite file is required; break-glass users and PAM admins (IdC users you promote) are stored as described above.

**EC2 troubleshooting (git pull, permission, ModuleNotFoundError):**

- **"dubious ownership" when running `git pull`:**  
  Run this **first**, then pull (otherwise pull fails and you won't get new files like `break_glass_db.py`):  
  `sudo git config --global --add safe.directory /opt/npamx/app`  
  Then: `cd /opt/npamx/app && sudo git pull origin main && sudo chown -R npamx:npamx /opt/npamx/app`

- **App was not a git repo / you cloned into a subdir by mistake:**  
  If you have `/opt/npamx/app/JIT-PAM-Enterprise` with the new code and the running app is `/opt/npamx/app`, copy the repo over the app (keep .env and backend/data):  
  `sudo cp -a /opt/npamx/app/.env /opt/npamx/app/backend/.env.bak 2>/dev/null; sudo rsync -a /opt/npamx/app/JIT-PAM-Enterprise/ /opt/npamx/app/; sudo chown -R npamx:npamx /opt/npamx/app; [ -f /opt/npamx/app/backend/.env.bak ] && sudo -u npamx mv /opt/npamx/app/backend/.env.bak /opt/npamx/app/backend/.env`

- **"Permission denied" opening add_break_glass_user.py:**  
  Ensure npamx can read the backend dir: `sudo chown -R npamx:npamx /opt/npamx/app`

- **"ModuleNotFoundError: No module named 'break_glass_db'"**  
  Run from backend with PYTHONPATH set:  
  `cd /opt/npamx/app/backend && sudo -u npamx PYTHONPATH=/opt/npamx/app/backend python3 add_break_glass_user.py`

---

## 6. SAML metadata (Identity Center)

The app expects IdP metadata at `backend/saml/idp_metadata.xml`. Commit this file in your repo (e.g. under `backend/saml/idp_metadata.xml`) so it is present when you clone/pull on EC2. If the repo doesn’t have it yet, create the directory and add the file on EC2 (or add it locally and push):

```bash
# Ensure saml dir exists (if not already in repo)
sudo mkdir -p /opt/npamx/app/backend/saml
sudo chown npamx:npamx /opt/npamx/app/backend/saml
# Then place idp_metadata.xml there (e.g. copy from testing EC2, or add to repo and git pull).
```

If the file is already in your repo, no need to copy again.

---

## 7. Test run (Gunicorn)

```bash
cd /opt/npamx/app/backend
sudo -u npamx /opt/npamx/app/backend/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 120 "app:app"
```

If it starts without errors, press **Ctrl+C** and continue. If it fails (e.g. missing `saml` or module), fix that first.

---

## 8. Systemd service (run app on boot and in background)

```bash
sudo tee /etc/systemd/system/npamx.service << 'EOF'
[Unit]
Description=NPAMX JIT PAM (Flask)
After=network.target

[Service]
Type=simple
User=npamx
Group=npamx
WorkingDirectory=/opt/npamx/app/backend
EnvironmentFile=/opt/npamx/app/backend/.env
ExecStart=/opt/npamx/app/backend/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 120 "app:app"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable npamx
sudo systemctl start npamx
sudo systemctl status npamx
```

---

## 9. Nginx: serve frontend and proxy API + SAML

```bash
sudo tee /etc/nginx/sites-available/npamx << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /opt/npamx/app/frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
    }

    location /saml/ {
        proxy_pass http://127.0.0.1:5000/saml/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /login {
        proxy_pass http://127.0.0.1:5000/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/npamx /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
```

---

## 10. Firewall (EC2 security group)

In **AWS Console → EC2 → Security groups → your instance’s SG → Edit inbound rules**:

- **Type:** HTTP  
- **Port:** 80  
- **Source:** `0.0.0.0/0` (or your IP for testing)

Save.

---

## 10b. Load balancer target group – why the instance shows unhealthy

If your instance is behind an **Application Load Balancer** and the **target group** shows the instance as **Unhealthy**, check the following.

### 1. Target group port must be 80

Traffic from the ALB must go to **port 80** (nginx). The app (Gunicorn) listens only on `127.0.0.1:5000`, so it is not reachable from the ALB.  
**Fix:** In the target group, set **Port** to **80** (or use "Same as load balancer" if the listener is on 80).

### 2. Health check path and port

Use an HTTP health check that nginx can serve:

- **Protocol:** HTTP  
- **Port:** 80 (or "Traffic port")  
- **Path:** `/api/health` or `/`  
  - `/api/health` hits the Flask app (via nginx) and returns 200; good to confirm both nginx and the app are up.  
  - `/` returns the frontend (index.html); also fine.

In **Target group → Health checks**: set **Path** to `/api/health` (or `/`), **Port** to 80.

### 3. Instance security group must allow the ALB

The ALB sends health checks and traffic to the instance on **port 80**. If the instance security group does **not** allow inbound on 80 from the ALB, the target will be **Unhealthy**.

**Fix:** Add an **inbound** rule on the **instance** security group:

- **Type:** HTTP (or Custom TCP)  
- **Port:** 80  
- **Source:** Security group of the **load balancer** (choose the ALB's SG)

Alternatively you can allow **port 80** from the **VPC CIDR** (e.g. `10.0.0.0/8` or your VPC range) so the ALB (in the same VPC) can reach the instance.

### 4. Quick check on the instance

SSH to the instance and run:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/health
```

Both should return **200**. If not, check `sudo systemctl status nginx` and `sudo systemctl status npamx`, and fix nginx/Flask before changing the ALB.

### 5. Still unhealthy – run these on the instance

**A) Confirm nginx is listening on all interfaces (port 80):**

```bash
ss -tlnp | grep :80
# or: sudo netstat -tlnp | grep :80
```

You should see `0.0.0.0:80` or `*:80`. If you see `127.0.0.1:80` only, nginx is not accepting external traffic; fix the `listen` directive to use `80` (default is all interfaces).

**B) See if health checks are reaching the instance:**

In one terminal, stream the nginx access log. Then wait 1–2 minutes (health check interval) and see if any new lines appear when the ALB checks:

```bash
sudo tail -f /var/log/nginx/access.log
```

If **no new lines** appear, traffic from the ALB is **not reaching** the instance → fix **security group** (instance must allow inbound 80 from the **ALB’s** SG) or **subnet NACL** (inbound 80 from ALB subnet / VPC allowed).

If **lines do appear** but the target is still unhealthy, check the **response code** in the log (e.g. 200 vs 302/403). Also in **Target group → Monitoring**, check the **UnHealthyHostCount** and **RequestCount** and the **Health check** tab for failure reason.

**C) Subnet NACL (often overlooked):**

- **Instance subnet:** Inbound rules must allow **port 80** from the ALB (e.g. from the ALB subnet CIDR or `0.0.0.0/0`). Outbound must allow ephemeral ports (1024–65535) so responses can go back.
- **ALB subnet:** Outbound allows 80 to instance subnet (or 0.0.0.0/0); inbound allows ephemeral for return traffic.

If the instance subnet NACL has a “deny” or no “allow 80” from the ALB’s source, health checks will fail even when the instance SG allows 80.

---

**D) Host firewall on the instance (ufw / iptables)**  
Even if the AWS security group allows port 80, a host firewall on the EC2 can drop traffic. On the instance run: `sudo ufw status` and `sudo iptables -L -n`. If ufw is active and port 80 is not allowed, run: `sudo ufw allow 80/tcp && sudo ufw reload`.

**E) Test from another host in the same VPC**  
From another EC2 or bastion in the same VPC run: `curl -s -o /dev/null -w "%{http_code}" http://<INSTANCE_PRIVATE_IP>/`. If it returns 200, the block is between ALB and instance (e.g. ALB SG or NACL). If it times out, the block is on the instance (SG, NACL, or host firewall).

---

## 11. Verify

- Open: **https://npamx.nyk00-int.network**
- You should see the login page with:
  - **Login with SSO** → AWS Identity Center (normal users).
  - **Login with Password** → only for the break-glass user (email set in `PAM_SUPER_ADMIN_SEED_EMAIL`).

**Logs:**

```bash
sudo journalctl -u npamx -f
```

**Restart app after .env or code changes:**

```bash
sudo systemctl restart npamx
```

---

## 12. Summary: who logs in how

| User type              | Login method              | Config |
|------------------------|---------------------------|--------|
| Break-glass (full access) | Email + password      | Created **manually on EC2** with `python3 add_break_glass_user.py`; stored in `backend/data/npamx_break_glass.db`. They assign Identity Center users as admins/roles from the Admin panel. |
| All other users        | AWS IAM Identity Center (SSO) | `SSO_*` and `APP_BASE_URL` in `.env`; IdP metadata in `backend/saml/idp_metadata.xml`. PAM admins/roles are assigned by the break-glass user (or in `backend/data/pam_admins.json`). |

Ensure in **Identity Center** the application (SP) is configured with:

- ACS URL: `https://npamx.nyk00-int.network/saml/acs`
- Audience / Entity ID: `https://npamx.nyk00-int.network/saml/metadata`
