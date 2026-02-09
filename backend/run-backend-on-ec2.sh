#!/bin/bash
# Run this ON EC2 to start the Flask backend + Database Proxy
# Fixes 502 Bad Gateway by ensuring services run on ports 5000 and 5002

set -e
REGION="ap-south-1"
BUCKET="scptestbucketsatish"
PREFIX="npam-backend"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$SCRIPT_DIR}"

echo "=== NPAM Backend Startup ==="

# 1. Pull from S3 only if app.py missing (e.g. fresh EC2). Git clone has app.py.
if [ ! -f "$BACKEND_DIR/app.py" ]; then
  if command -v aws &>/dev/null; then
    echo "Pulling backend from S3..."
    mkdir -p /root/backend
    aws s3 sync "s3://$BUCKET/$PREFIX/" /root/backend/ --region "$REGION" --delete \
      --exclude "venv/*" --exclude ".venv/*" --exclude "__pycache__/*"
    BACKEND_DIR="/root/backend"
  else
    echo "ERROR: app.py not found. Clone from git or run from repo directory."
    exit 1
  fi
fi

cd "$BACKEND_DIR"

# 2. Python venv (recreate if broken - e.g. deleted by "aws s3 sync --delete")
if [ ! -f "venv/bin/activate" ]; then
  echo "Creating Python venv..."
  rm -rf venv 2>/dev/null || true
  python3 -m venv venv
fi
source venv/bin/activate

# 3. Install dependencies
if ! python -c "import flask" 2>/dev/null; then
  echo "Installing requirements..."
  pip install -q -r requirements.txt
fi

# 4. MySQL admin credentials - MUST match your MySQL root/admin user for DB user creation
# If you see "Access denied for user 'X'@'localhost'" after approval, set these:
#   export DB_ADMIN_USER=root
#   export DB_ADMIN_PASSWORD=your_mysql_root_password
export DB_ADMIN_USER="${DB_ADMIN_USER:-admin}"
export DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-admin123}"
export USE_DB_PROXY="${USE_DB_PROXY:-true}"

# 5. Kill any existing processes on 5000/5002
for port in 5000 5002; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  [ -n "$pid" ] && kill $pid 2>/dev/null || true
done
sleep 2

# 6. Start Database Proxy (port 5002)
echo "Starting Database Proxy on 5002..."
python database_proxy.py &
PROXY_PID=$!
sleep 2

# 7. Start Flask (port 5000)
echo "Starting Flask on 5000..."
python app.py &
FLASK_PID=$!
sleep 3

# 8. Verify
if curl -s http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
  echo ""
  echo "✅ Backend running!"
  echo "   Flask:  http://127.0.0.1:5000"
  echo "   Proxy:  http://127.0.0.1:5002"
  echo ""
  echo "Keep this terminal open, or run in screen:"
  echo "   cd /root/backend && screen -S npam ./run-backend-on-ec2.sh"
  wait
else
  echo "❌ Flask did not start. Check logs above."
  kill $PROXY_PID $FLASK_PID 2>/dev/null || true
  exit 1
fi
