#!/bin/bash
# One-command fix on EC2: resolve git conflict, pull latest, apply nginx
# Run as root: ./scripts/fix-ec2-deploy.sh

set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "=== 1. Discard local frontend changes (blocking git pull) ==="
git checkout -- frontend/ 2>/dev/null || true

echo "=== 2. Pull latest ==="
git pull origin main

echo "=== 3. Apply nginx config ==="
"$REPO_DIR/scripts/configure-nginx-git.sh"

echo ""
echo "Done. Hard-refresh browser (Ctrl+Shift+R) to clear cache."
