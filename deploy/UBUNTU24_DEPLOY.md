# Deploy NPAMX on Ubuntu 24 — Full commands

- **Break-glass users:** login with **username and password** (emergency admin).
- **All other users:** login through **AWS IAM Identity Center** (SSO).

Use your EC2 public IP or domain everywhere you see `YOUR_EC2_IP` or `YOUR_DOMAIN`.

---

## Commands from the beginning (run in order)

Code is in a repo; you push from your machine and **pull on EC2**. No SCP or zip. All commands below run **on the Ubuntu 24 EC2** (SSH in as `ubuntu` or your admin user).

Replace `YOUR_REPO_URL` (e.g. `https://github.com/your-org/sso.git` or `git@github.com:your-org/sso.git`), `YOUR_EC2_IP`, and other placeholders. For a **private repo**, either use an HTTPS URL with a personal access token, or configure an SSH key on the EC2 for `git@...` URLs.

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
CORS_ORIGINS=http://YOUR_EC2_IP
APP_BASE_URL=http://YOUR_EC2_IP
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
   Set `YOUR_EC2_IP`, break-glass email, and SSO ARN / Identity Store ID / start URL.
2. **Security group:** allow inbound HTTP (port 80) from `0.0.0.0/0` (or your IP).
3. Open **http://YOUR_EC2_IP** — SSO for normal users, password for break-glass.

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

**Create the env file** (replace `YOUR_SECRET_KEY`, `YOUR_EC2_IP`, and AWS/SSO values):

```bash
sudo -u npamx tee /opt/npamx/app/backend/.env << 'EOF'
# === Required for production ===
FLASK_ENV=production
FLASK_SECRET_KEY=YOUR_SECRET_KEY
PORT=5000

# Frontend URL (CORS) — use http://YOUR_EC2_IP or https://your-domain.com
CORS_ORIGINS=http://YOUR_EC2_IP

# Base URL of this app (for SAML ACS callback). Use https if you add SSL later.
APP_BASE_URL=http://YOUR_EC2_IP

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
- `CORS_ORIGINS=http://YOUR_EC2_IP`
- `APP_BASE_URL=http://YOUR_EC2_IP`
- `PAM_SUPER_ADMIN_SEED_EMAIL` (break-glass admin email)
- `SSO_INSTANCE_ARN`, `IDENTITY_STORE_ID`, `SSO_START_URL` (from your AWS IAM Identity Center / SSO setup)

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

## 11. Verify

- Open: **http://YOUR_EC2_IP**
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
| Break-glass (emergency)| Username + password       | `PAM_SUPER_ADMIN_SEED_EMAIL` in `.env`; user must be in PAM admins or seed. |
| All other users        | AWS IAM Identity Center   | `SSO_*` and `APP_BASE_URL` in `.env`; IdP metadata in `backend/saml/idp_metadata.xml`. |

Ensure in **Identity Center** the application (SP) is configured with ACS URL:  
`http://YOUR_EC2_IP/saml/acs` (or `https://...` if you add SSL).
