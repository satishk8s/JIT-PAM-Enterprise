#!/bin/bash
# Start Database Proxy + Flask Backend
# TEACHING: Run this to start both services for database access with proxy

for p in python3 python3.9 python3.8 python; do
  if command -v "$p" >/dev/null 2>&1; then
    PYTHON="$p"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "ERROR: No Python found. Install with: sudo yum install python3   (Amazon Linux 2)"
  echo "   or: sudo dnf install python3   (Amazon Linux 2023)"
  exit 1
fi

echo "Starting Database Access Proxy on port 5002 (using $PYTHON)..."
$PYTHON database_proxy.py &
PROXY_PID=$!
sleep 2

echo "Starting Flask backend on port 5000..."
$PYTHON app.py &
FLASK_PID=$!

echo ""
echo "✅ Both services started:"
echo "   Proxy (5002): PID $PROXY_PID"
echo "   Flask (5000): PID $FLASK_PID"
echo ""
echo "To stop: kill $PROXY_PID $FLASK_PID"
wait

