#!/bin/bash
# NPAMX quick deploy on a new EC2 (Amazon Linux 2 or Ubuntu).
# Run as root or with sudo. Set APP_DIR to where the project is (e.g. /opt/npamx/app).

set -e
APP_DIR="${APP_DIR:-/opt/npamx/app}"
BACKEND="${APP_DIR}/backend"
FRONTEND="${APP_DIR}/frontend"

echo "=== NPAMX deploy: $APP_DIR ==="

# 1) Install OS packages (detect distro)
if command -v yum &>/dev/null; then
  sudo yum update -y
  sudo yum install -y python3 python3-pip nginx git
elif command -v apt-get &>/dev/null; then
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y python3 python3-pip python3-venv nginx git
else
  echo "Unsupported OS. Install python3, pip, nginx, git manually."
  exit 1
fi

# 2) App dir and user
sudo useradd -r -s /bin/false npamx 2>/dev/null || true
sudo mkdir -p "$APP_DIR"
sudo chown -R npamx:npamx "$APP_DIR" 2>/dev/null || true

# 3) Python venv and deps (project must already be in $APP_DIR)
if [ ! -f "$BACKEND/requirements.txt" ]; then
  echo "Put the project in $APP_DIR (backend/ and frontend/). Then run this again."
  exit 1
fi
cd "$BACKEND"
sudo -u npamx python3 -m venv venv
sudo -u npamx "$BACKEND/venv/bin/pip" install --upgrade pip
sudo -u npamx "$BACKEND/venv/bin/pip" install -r "$BACKEND/requirements.txt"

# 4) .env if missing
if [ ! -f "$BACKEND/.env" ]; then
  echo "Creating $BACKEND/.env – edit FLASK_SECRET_KEY and CORS_ORIGINS."
  sudo -u npamx tee "$BACKEND/.env" << 'ENVEOF'
FLASK_ENV=production
FLASK_SECRET_KEY=CHANGE_ME_USE_openssl_rand_hex_32
PORT=5000
CORS_ORIGINS=http://localhost
ENVEOF
fi

# 5) Systemd service
sudo tee /etc/systemd/system/npamx.service << SVCEOF
[Unit]
Description=NPAMX JIT PAM
After=network.target

[Service]
Type=simple
User=npamx
Group=npamx
WorkingDirectory=$BACKEND
EnvironmentFile=$BACKEND/.env
ExecStart=$BACKEND/venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 --timeout 120 "app:app"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable npamx
sudo systemctl start npamx

# 6) Nginx
sudo tee /etc/nginx/conf.d/npamx.conf << NGXEOF
server {
    listen 80;
    server_name _;
    root $FRONTEND;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
    location /saml/ {
        proxy_pass http://127.0.0.1:5000/saml/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGXEOF

sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo "Done. Open http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo 'YOUR_EC2_IP')"
echo "Edit $BACKEND/.env: set FLASK_SECRET_KEY and CORS_ORIGINS=http://YOUR_EC2_IP"
echo "Then: sudo systemctl restart npamx"
