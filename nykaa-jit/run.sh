#!/bin/bash
# JIT-PAM-Enterprise: Clone and run - no manual steps
# Usage: ./run.sh  (or: bash run.sh)

set -e
cd "$(dirname "$0")"

echo "=== JIT-PAM-Enterprise ==="

# 1. Create venv if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# 2. Activate and install deps
echo "Installing dependencies..."
source venv/bin/activate
pip install -q -r backend/requirements.txt

# 3. Start backend in background (must run from backend/ for config files)
echo "Starting backend (port 5000)..."
(cd backend && python app.py) &
BACKEND_PID=$!

# 4. Wait for backend to be ready
sleep 3
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Backend failed to start. Check logs above."
    exit 1
fi

# 5. Start frontend
echo "Starting frontend (port 3000)..."
cd frontend
python3 -m http.server 3000 &
FRONTEND_PID=$!
cd ..

# Trap to kill both on Ctrl+C
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "=========================================="
echo "  App is running!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000"
echo "  Press Ctrl+C to stop"
echo "=========================================="

# Open browser if possible (macOS/Linux)
if command -v open &>/dev/null; then
    open "http://localhost:3000" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null || true
fi

wait $FRONTEND_PID
