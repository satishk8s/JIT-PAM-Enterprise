#!/bin/bash
# Start Database Proxy + Flask Backend
# TEACHING: Run this to start both services for database access with proxy

echo "Starting Database Access Proxy on port 5002..."
python database_proxy.py &
PROXY_PID=$!
sleep 2

echo "Starting Flask backend on port 5000..."
python app.py &
FLASK_PID=$!

echo ""
echo "✅ Both services started:"
echo "   Proxy (5002): PID $PROXY_PID"
echo "   Flask (5000): PID $FLASK_PID"
echo ""
echo "To stop: kill $PROXY_PID $FLASK_PID"
wait

