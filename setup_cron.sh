#!/bin/bash
# Setup cron jobs for JIT access automation

echo "🚀 Setting up JIT Access automation..."

# Create cron job for every 15 minutes
CRON_JOB="*/15 * * * * cd /Users/satish.korra/Desktop/sso && python scheduler.py >> /tmp/jit_scheduler.log 2>&1"

# Add to crontab
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job added: Every 15 minutes"
echo "📝 Logs will be written to: /tmp/jit_scheduler.log"

# Create systemd service for production (Linux)
cat > /tmp/jit-scheduler.service << EOF
[Unit]
Description=JIT Access Scheduler
After=network.target

[Service]
Type=simple
User=jit-user
WorkingDirectory=/opt/jit-access
ExecStart=/usr/bin/python3 /opt/jit-access/scheduler.py
Restart=always
RestartSec=900

[Install]
WantedBy=multi-user.target
EOF

echo "📋 Systemd service template created at: /tmp/jit-scheduler.service"
echo ""
echo "🔧 Manual setup required:"
echo "1. Run: python dynamodb_setup.py (to create tables)"
echo "2. Deploy production_app.py to your server"
echo "3. Set up monitoring for /tmp/jit_scheduler.log"
echo ""
echo "⏰ Current cron jobs:"
crontab -l