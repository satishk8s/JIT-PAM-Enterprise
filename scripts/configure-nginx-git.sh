#!/bin/bash
# Configure nginx to serve frontend from Git repo (not S3)
# Run as root after git clone. Enables gzip, caching, keepalive for fast UI.

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="$REPO_DIR/frontend"

if [ ! -f "$WEB_ROOT/index.html" ]; then
    echo "❌ $WEB_ROOT/index.html not found"
    exit 1
fi

chmod -R 755 "$WEB_ROOT" 2>/dev/null || true

echo "Configuring nginx to serve from $WEB_ROOT..."
cat > /etc/nginx/conf.d/npam.conf << NGINX
# Gzip - reduces payload, faster load
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_proxied any;
gzip_comp_level 5;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

server {
    listen 80;
    server_name _;
    root $WEB_ROOT;
    index index.html;

    # Cache static assets - reduces latency on scroll/interaction
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # API proxy - keepalive for lower latency
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
}
NGINX

nginx -t && systemctl restart nginx
echo "✅ Nginx configured for $WEB_ROOT"
