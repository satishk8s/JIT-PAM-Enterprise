# Deploy NPAMX/JIT PAM on a new EC2 instance

Use these steps on a **brand new** Amazon Linux 2 or Ubuntu EC2. Replace `YOUR_DOMAIN_OR_IP` with your PAM hostname. Current target domain: `https://npamx.nyk00-int.network`.

---

## 1. Connect to EC2 and install base packages

**Amazon Linux 2:**
```bash
sudo yum update -y
sudo yum install -y python3 python3-pip nginx git
```

**Ubuntu 22.04:**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx git
```

---

## 2. Create app user and directory

```bash
sudo useradd -r -s /bin/false npamx 2>/dev/null || true
sudo mkdir -p /opt/npamx
sudo chown -R npamx:npamx /opt/npamx
```

---

## 3. Upload or clone the project

**Option A – Clone from Git (if repo is in GitHub/GitLab):**
```bash
sudo -u npamx git clone https://github.com/YOUR_ORG/sso.git /opt/npamx/app
```

**Option B – Copy from your machine (run from your laptop):**
```bash
# From your laptop (replace EC2_IP and key)
scp -i your-key.pem -r /path/to/sso/* ec2-user@EC2_IP:/tmp/sso-upload/
# Then on EC2:
sudo mv /tmp/sso-upload/* /opt/npamx/app/
sudo chown -R npamx:npamx /opt/npamx/app
```

**Option C – Zip and copy:**
```bash
# On your laptop
cd /path/to
zip -r sso-deploy.zip sso -x "*.git*" -x "*__pycache__*" -x "*.pyc"

scp -i your-key.pem sso-deploy.zip ec2-user@EC2_IP:/tmp/
# On EC2:
sudo unzip -o /tmp/sso-deploy.zip -d /tmp/
sudo mv /tmp/sso/* /opt/npamx/app/
sudo chown -R npamx:npamx /opt/npamx/app
```

---

## 4. Python virtualenv and dependencies

```bash
cd /opt/npamx/app/backend
sudo -u npamx python3 -m venv venv
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install --upgrade pip
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install -r /opt/npamx/app/backend/requirements.txt
sudo -u npamx /opt/npamx/app/backend/venv/bin/pip install gunicorn
```

---

## 5. Environment file (production)

```bash
sudo -u npamx tee /opt/npamx/app/backend/.env << 'EOF'
FLASK_ENV=production
FLASK_SECRET_KEY=CHANGE_THIS_TO_A_LONG_RANDOM_STRING
PORT=5000

# Frontend URL (for CORS) – use your PAM domain
CORS_ORIGINS=https://npamx.nyk00-int.network
APP_BASE_URL=https://npamx.nyk00-int.network

# Optional: if frontend is on same host, you can use:
# CORS_ORIGINS=http://localhost,http://YOUR_EC2_PUBLIC_IP

# AWS / PAM (set these or use defaults in code)
# SSO_INSTANCE_ARN=arn:aws:sso:::instance/ssoins-xxxx
# IDENTITY_STORE_ID=d-xxxxxxxx
# SSO_START_URL=https://your-org.awsapps.com/start
# PAM_ADMIN_SEED_EMAIL=admin@yourcompany.com
EOF
```

**Important:** Replace `CHANGE_THIS_TO_A_LONG_RANDOM_STRING` with a random secret (e.g. `openssl rand -hex 32`). For this environment, use `https://npamx.nyk00-int.network` for both `CORS_ORIGINS` and `APP_BASE_URL`.

---

## 6. Run the app with Gunicorn (test)

```bash
cd /opt/npamx/app/backend
source venv/bin/activate
export FLASK_ENV=production
gunicorn -w 2 -b 0.0.0.0:5000 --timeout 120 "app:app"
```

If it starts without errors, press Ctrl+C and continue. Next we’ll add nginx and a systemd service.

---

## 7. Systemd service (run app on boot)

```bash
sudo tee /etc/systemd/system/npamx.service << 'EOF'
[Unit]
Description=NPAMX JIT PAM Flask App
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

## 8. Nginx: serve frontend and proxy API

```bash
sudo tee /etc/nginx/conf.d/npamx.conf << 'EOF'
server {
    listen 80;
    server_name _;   # or your domain

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
}
EOF

# Remove default site if it conflicts (Ubuntu)
sudo rm -f /etc/nginx/sites-enabled/default  2>/dev/null || true

sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
```

---

## 9. Open firewall (EC2 security group)

In **AWS Console → EC2 → Security Groups → your instance’s SG**:

- Inbound: **HTTP 80** from `0.0.0.0/0` (or your IP) so you can reach nginx.
- Optional: **HTTPS 443** if you add SSL later.

---

## 10. Set CORS and app URL

Edit `/opt/npamx/app/backend/.env` and set:

- `CORS_ORIGINS=https://npamx.nyk00-int.network`
- `APP_BASE_URL=https://npamx.nyk00-int.network` (used for SAML ACS URL and entity ID)

Then restart the app:

```bash
sudo systemctl restart npamx
```

---

## 11. Verify

- Open in browser: `http://YOUR_EC2_PUBLIC_IP`
- You should see the login page; API calls go to `http://YOUR_EC2_PUBLIC_IP/api/`.

**Logs:**
```bash
sudo journalctl -u npamx -f
```

**Restart app after code or .env changes:**
```bash
sudo systemctl restart npamx
```

---

## Optional: HTTPS with Let’s Encrypt (domain required)

```bash
# Ubuntu
sudo apt install -y certbot python3-certbot-nginx

# Amazon Linux 2
sudo yum install -y certbot python3-certbot-nginx

# Get certificate (replace if your final domain changes)
sudo certbot --nginx -d npamx.nyk00-int.network
```

Then set in `.env`: `CORS_ORIGINS=https://npamx.nyk00-int.network` and `APP_BASE_URL=https://npamx.nyk00-int.network`, and restart `npamx`.
