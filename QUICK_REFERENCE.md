# Quick Reference Guide

## 🚀 Starting the Application

### Backend
```bash
cd /Users/satish.korra/Desktop/sso/backend
python app.py
```
**URL:** http://127.0.0.1:5000

### Frontend
```bash
cd /Users/satish.korra/Desktop/sso/frontend
open index.html
# Or just double-click index.html
```

---

## 📁 Key File Locations

### Most Important Files
```
backend/app.py                          # Main API server
backend/conversation_manager.py         # AI engine
frontend/index.html                     # Main UI
frontend/aws-permissions-chat.js        # AI chat
backend/sso.db                          # Database
```

### Configuration
```
backend/bedrock_config.json             # AI settings
backend/guardrails_config.json          # Security rules
backend/.env                            # AWS credentials (NEVER COMMIT)
```

---

## 🔧 Common Tasks

### View Logs
```bash
tail -f backend/app.log
tail -f backend/backend.log
```

### Backup Database
```bash
cp backend/sso.db backend/sso.db.backup_$(date +%Y%m%d)
```

### Check Python Dependencies
```bash
cd backend
pip list | grep -E "flask|boto3"
```

### Hard Refresh Browser
- **Mac:** `Cmd + Shift + R`
- **Windows:** `Ctrl + Shift + R`

---

## 🗂️ Folder Structure

```
sso/
├── backend/              # Flask API server
│   ├── app.py           # Main application
│   ├── *.py             # Python modules
│   ├── *.json           # Configuration files
│   ├── sso.db           # Database
│   └── .env             # Environment variables
│
├── frontend/            # User interface
│   ├── index.html       # Main page
│   ├── *.js             # JavaScript modules
│   ├── *.css            # Stylesheets
│   └── assets/          # Images and logos
│
└── *.md                 # Documentation
```

---

## 🎯 Feature Locations

| Feature | Frontend File | Backend File |
|---------|--------------|--------------|
| AI Chat | aws-permissions-chat.js | conversation_manager.py |
| EC2 Terminal | instances.js | terminal_server.py |
| S3 Explorer | s3-explorer.js | app.py (S3 endpoints) |
| Policy Builder | policy-builder.js | database_manager.py |
| Guardrails | guardrails.js | guardrails_generator.py |
| SCP Manager | scp-manager.js | scp_manager.py |
| Admin Panel | admin-functions.js, org-management.js | app.py (admin endpoints) |
| Help Assistant | help-assistant.js | help_assistant.py |

---

## 🔒 Security Reminders

- ✅ `.env` files are in `.gitignore`
- ✅ Never commit AWS credentials
- ✅ Database contains sensitive data
- ✅ Backup before any changes

---

## 📚 Documentation Files

- `PROJECT_STRUCTURE.md` - Complete project structure
- `CODE_LOCK.md` - Code lock and change procedures
- `backend/README.md` - Backend documentation
- `frontend/README.md` - Frontend documentation
- `QUICK_REFERENCE.md` - This file

---

## 🆘 Troubleshooting

### Backend won't start
```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend not loading
- Hard refresh: `Cmd+Shift+R`
- Check browser console (F12)
- Verify backend is running

### AI not responding
- Check `backend/bedrock_config.json`
- Verify AWS credentials in `.env`
- Check backend logs

### Database errors
```bash
cd backend
# Restore from backup
cp sso.db.backup_YYYYMMDD sso.db
```

---

## 📞 Quick Commands

```bash
# Create backup
cd /Users/satish.korra/Desktop
tar -czf sso_backup_$(date +%Y%m%d_%H%M%S).tar.gz sso/

# Restore backup
tar -xzf sso_backup_YYYYMMDD_HHMMSS.tar.gz

# Check if backend is running
curl http://127.0.0.1:5000/api/health

# View recent logs
tail -20 backend/app.log
```

---

## ✅ System Status Check

```bash
# Backend running?
curl -s http://127.0.0.1:5000/api/health && echo "✅ Backend OK" || echo "❌ Backend Down"

# Database exists?
ls -lh backend/sso.db && echo "✅ Database OK" || echo "❌ Database Missing"

# Config files exist?
ls backend/bedrock_config.json backend/guardrails_config.json && echo "✅ Config OK" || echo "❌ Config Missing"
```

---

**For detailed information, see PROJECT_STRUCTURE.md**
