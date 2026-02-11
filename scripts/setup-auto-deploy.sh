#!/bin/bash
# One-time setup on EC2: systemd service + git hook for backend+nginx refresh on pull
# Run as root: ./scripts/setup-auto-deploy.sh

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== NPAMX Auto-Deploy Setup ==="
echo "Repo: $REPO_DIR"

# 1. Ensure backend script is executable (fixes 203/EXEC)
chmod +x "$REPO_DIR/backend/run-backend-on-ec2.sh" 2>/dev/null || true

# 1. Install systemd service (path is set from repo location)
SVC_FILE="$REPO_DIR/scripts/npam-backend.service"
BACKEND_DIR="$REPO_DIR/backend"
if [ -f "$SVC_FILE" ] && [ -f "$BACKEND_DIR/run-backend-on-ec2.sh" ]; then
    cat > /etc/systemd/system/npam-backend.service << EOF
[Unit]
Description=NPAMX Backend (Flask + Database Proxy)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$BACKEND_DIR
ExecStart=$BACKEND_DIR/run-backend-on-ec2.sh
Environment="DB_ADMIN_USER=admin"
Environment="DB_ADMIN_PASSWORD=admin123"
Environment="USE_DB_PROXY=true"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable npam-backend
    echo "✅ Systemd service installed and enabled"
else
    echo "❌ $SVC_FILE or $BACKEND_DIR/run-backend-on-ec2.sh not found"
    exit 1
fi

# 2. Configure nginx for fast UI (gzip, cache) - REQUIRED for resolution/performance
if [ -f "$REPO_DIR/scripts/configure-nginx-git.sh" ]; then
    chmod +x "$REPO_DIR/scripts/configure-nginx-git.sh"
    "$REPO_DIR/scripts/configure-nginx-git.sh" 2>/dev/null || echo "⚠️  Run manually: ./scripts/configure-nginx-git.sh"
fi

# 3. Ensure backend script executable + install git post-merge hook
HOOK_SRC="$REPO_DIR/scripts/post-merge"
HOOK_DST="$REPO_DIR/.git/hooks/post-merge"
if [ -d "$REPO_DIR/.git" ] && [ -f "$HOOK_SRC" ]; then
    cp "$HOOK_SRC" "$HOOK_DST"
    chmod +x "$HOOK_DST"
    echo "✅ Git post-merge hook installed"
else
    echo "⚠️  No .git dir - run 'git clone' first, then re-run this script"
fi

# 4. Start (or restart) the service
systemctl restart npam-backend 2>/dev/null || systemctl start npam-backend
echo "✅ Backend service started"
echo ""
echo "Done! From now on:"
echo "  - Backend runs automatically (survives reboot)"
echo "  - 'git pull' will auto-restart backend and re-apply nginx/frontend bundle"
echo "  - No manual intervention needed"
