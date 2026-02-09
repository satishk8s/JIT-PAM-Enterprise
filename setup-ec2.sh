#!/bin/bash
# Run this ON EC2 to set up frontend + nginx. Run after push-to-s3.sh from Mac.

set -e
REGION="ap-south-1"
BUCKET="scptestbucketsatish"
PREFIX="npam"
WEB_ROOT="/root/frontend"

echo "=== NPAM EC2 Setup ==="

# 1. Sync frontend from S3 (same location as before Python server)
echo "Syncing frontend from S3..."
mkdir -p "$WEB_ROOT"
aws s3 sync "s3://$BUCKET/$PREFIX/" "$WEB_ROOT/" --region "$REGION" --delete

# 2. Ensure app.js lowercase (S3 can be case-sensitive)
[ -f "$WEB_ROOT/App.js" ] && mv "$WEB_ROOT/App.js" "$WEB_ROOT/app.js"

# 3. Allow nginx to read /root/frontend (same files as Python server)
sudo chmod 755 /root 2>/dev/null || true
sudo chmod -R 755 "$WEB_ROOT" 2>/dev/null || true

# 4. Nginx config - serve from /root/frontend + gzip + caching for faster UI
echo "Configuring nginx..."
sudo tee /etc/nginx/conf.d/npam.conf > /dev/null << 'NGINX'
# Gzip - reduces payload size, faster load over network
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_proxied any;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

server {
    listen 80;
    server_name _;
    root /root/frontend;
    index index.html;

    # Cache static assets (CSS, JS, images) - reduces latency on scroll/interaction
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # API proxy - keepalive for lower latency
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
}
NGINX

# 5. Test and restart nginx
sudo nginx -t && sudo systemctl restart nginx
echo "✅ Nginx restarted"

# 6. Verify
echo ""
echo "Verify:"
echo "  curl -s http://127.0.0.1/ | head -5"
echo ""
echo "⚠️  IMPORTANT: Start the backend to fix 502 Bad Gateway:"
echo "  1. Pull backend:  aws s3 sync s3://$BUCKET/npam-backend/ /root/backend/ --region $REGION --delete"
echo "  2. Run backend:   cd /root/backend && chmod +x run-backend-on-ec2.sh && ./run-backend-on-ec2.sh"
echo "  3. Or in screen: screen -S npam -dm bash -c 'cd /root/backend && ./run-backend-on-ec2.sh'"
echo ""
echo "Then open: http://YOUR-EC2-IP/"

