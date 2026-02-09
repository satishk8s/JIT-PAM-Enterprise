# NPAMX – Git Deployment (Auto-Restart on Pull)

**Repo:** `git@github.com:satishk8s/JIT-PAM-Enterprise.git`

Backend runs as a systemd service. After `git pull`, the backend restarts automatically. No manual steps.

---

## 1. First-Time Setup (Mac)

```bash
cd /Users/satish.korra/Desktop/sso/nykaa-jit

# Add remote (if not already)
git remote add origin git@github.com:satishk8s/JIT-PAM-Enterprise.git

# Or change existing:
git remote set-url origin git@github.com:satishk8s/JIT-PAM-Enterprise.git

# Push
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

---

## 2. First-Time Setup (EC2)

```bash
# Clone (path can be anywhere, e.g. /root/JIT-PAM-Enterprise or /root/npamx)
cd /root
git clone git@github.com:satishk8s/JIT-PAM-Enterprise.git
cd JIT-PAM-Enterprise

# One-time: install systemd service + git hook
chmod +x scripts/setup-auto-deploy.sh
./scripts/setup-auto-deploy.sh
```

This installs:
- **systemd service** – backend runs via `run-backend-on-ec2.sh`, survives reboot
- **post-merge hook** – `git pull` triggers backend restart

---

## 3. Deploy (No Manual Steps)

### On Mac (push)
```bash
cd /Users/satish.korra/Desktop/sso/nykaa-jit
git add .
git commit -m "Your changes"
git push origin main
```

### On EC2 (pull – backend auto-restarts)
```bash
cd /root/JIT-PAM-Enterprise   # or your clone path
git pull origin main
```

After `git pull`, the post-merge hook runs and restarts the backend. No other commands needed.

---

## 4. Useful Commands (EC2)

```bash
# Check backend status
systemctl status npam-backend

# View logs
journalctl -u npam-backend -f

# Manual restart (if needed)
systemctl restart npam-backend
```

---

## 5. Environment (MySQL)

If you use MySQL root instead of admin, create `/etc/systemd/system/npam-backend.service.d/override.conf`:

```ini
[Service]
Environment="DB_ADMIN_USER=root"
Environment="DB_ADMIN_PASSWORD=your_mysql_password"
```

Then:
```bash
systemctl daemon-reload
systemctl restart npam-backend
```

---

## 6. Frontend

- **Option A:** nginx serves from `/root/JIT-PAM-Enterprise/frontend` – update nginx config
- **Option B:** Keep S3 for frontend – push frontend separately via `./push-to-s3.sh`

---

## 7. Future: CI/CD

Later you can add GitHub Actions to run `git pull` on EC2 when you push (no SSH needed from your machine).
