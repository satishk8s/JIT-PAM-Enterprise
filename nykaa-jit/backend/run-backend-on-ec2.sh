#!/bin/bash
# Run this ON EC2 to start the Flask backend + Database Proxy
# Fixes 502 Bad Gateway by ensuring services run on ports 5000 and 5002

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$SCRIPT_DIR}"

echo "=== NPAM Backend Startup ==="

# 1. Ensure app.py exists (must run from git clone)
if [ ! -f "$BACKEND_DIR/app.py" ]; then
  echo "ERROR: app.py not found. Run from repo: cd /root/JIT-PAM-Enterprise/backend && ./run-backend-on-ec2.sh"
  exit 1
fi

cd "$BACKEND_DIR"

# 2. Python venv
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
  echo "   cd /root/JIT-PAM-Enterprise/backend && screen -S npam ./run-backend-on-ec2.sh"
  wait
else
  echo "❌ Flask did not start. Check logs above."
  kill $PROXY_PID $FLASK_PID 2>/dev/null || true
  exit 1
fi
