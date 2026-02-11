#!/bin/bash
# Configure nginx to serve frontend from Git repo (not S3)
# Run as root after git clone. Optimized for fast UI: static from disk, gzip, cache, sendfile.

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ROOT="$REPO_DIR/frontend"

if [ ! -f "$WEB_ROOT/index.html" ]; then
    echo "❌ $WEB_ROOT/index.html not found"
    exit 1
fi

# Build bundle for fast load (38+ requests → 4)
if [ -x "$REPO_DIR/scripts/bundle-frontend.sh" ]; then
    "$REPO_DIR/scripts/bundle-frontend.sh" || true
fi

chmod -R 755 "$WEB_ROOT" 2>/dev/null || true

# Disable default nginx config to avoid "conflicting server name" (our config gets ignored)
for f in /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default; do
    [ -f "$f" ] && mv "$f" "${f}.disabled" 2>/dev/null && echo "Disabled $f (was conflicting)"
done

# Remove legacy NPAM config filename if present (we now use 00-npam.conf for load-order priority)
if [ -f /etc/nginx/conf.d/npam.conf ]; then
    mv /etc/nginx/conf.d/npam.conf /etc/nginx/conf.d/npam.conf.disabled 2>/dev/null || true
fi

# Verify mime.types has font entries (prevents blurry fonts from wrong Content-Type)
if [ -f /etc/nginx/mime.types ] && ! grep -q 'font/woff2' /etc/nginx/mime.types 2>/dev/null; then
    echo "⚠️  Add to /etc/nginx/mime.types: font/woff2 woff2; font/woff woff;"
fi

echo "Configuring nginx to serve from $WEB_ROOT..."
cat > /etc/nginx/conf.d/00-npam.conf << NGINX
# === GZIP: Reduces payload 60–80% for text assets ===
# WHY: Smaller transfers = faster load, less bandwidth
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_proxied any;
gzip_comp_level 5;
gzip_types
    text/plain
    text/css
    text/xml
    text/javascript
    application/javascript
    application/json
    application/xml
    application/xml+rss
    application/font-woff
    application/font-woff2
    application/x-font-ttf
    font/woff
    font/woff2
    font/ttf
    image/svg+xml;

# NOTE: Ensure /etc/nginx/nginx.conf has: include /etc/nginx/mime.types;
# Correct Content-Type for fonts (font/woff2) prevents blurry rendering

server {
    listen 80;
    listen [::]:80;
    # Catch all hostnames (including raw IP) without clashing with stock server_name "_"
    server_name ~^.+$;
    root $WEB_ROOT;
    # Default to original entry for best visual fidelity.
    # Bundled entry is still available explicitly at /index-bundled.html.
    index index.html index-bundled.html;
    charset utf-8;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Zero-copy file send - bypasses userspace
    # WHY: Huge CPU reduction, lower latency for static files
    sendfile on;
    tcp_nopush on;
    etag on;

    # Cache open file descriptors for repeated requests
    # WHY: Reduces disk I/O on scroll and navigation
    open_file_cache max=1000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 1;

    # Versioned bundle artifacts can be cached longer (cache-busted via ?v=)
    location ~* ^/bundle\.(css|js)$ {
        try_files \$uri =404;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        add_header X-Content-Type-Options "nosniff";
    }

    # === STATIC FILES (must match before location /) ===
    # Served directly from disk - NOT proxied to Flask
    # Use moderate cache by default to avoid stale assets after deploy.
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?|ttf|eot)$ {
        try_files \$uri =404;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
        add_header X-Content-Type-Options "nosniff";
    }

    # HTML - SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html /index-bundled.html;
        add_header Cache-Control "no-cache";
    }

    # === API ONLY: proxy to Flask ===
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
