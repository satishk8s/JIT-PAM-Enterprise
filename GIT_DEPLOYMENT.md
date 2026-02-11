# NPAMX – Git Deployment (Auto-Refresh on Pull)

**Repo:** `git@github-verityx:satishk8s/JIT-PAM-Enterprise.git`

(Use `github-verityx` host for SSH – same key as vijenex/sso repos.)

Backend runs as a systemd service. After `git pull`, backend restarts and nginx/frontend bundle are refreshed automatically (when pull is run as root). No manual steps.

---

## 1. First-Time Setup (Mac)

```bash
cd /Users/satish.korra/Desktop/sso/nykaa-jit

# Add remote (if not already)
git remote add origin git@github-verityx:satishk8s/JIT-PAM-Enterprise.git

# Or change existing:
git remote set-url origin git@github-verityx:satishk8s/JIT-PAM-Enterprise.git

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
# On Mac: use github-verityx. On EC2: use github.com if you have a different key.
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

### On EC2 (pull – backend + nginx/frontend auto-refresh)
```bash
cd /root/JIT-PAM-Enterprise   # or your clone path
git pull origin main
```

After `git pull`, the post-merge hook runs:
- restarts backend service
- rebuilds frontend bundle
- reloads nginx config

No other commands needed.

If this repo was set up before this change, run once to refresh hooks:
```bash
cd /root/JIT-PAM-Enterprise
./scripts/setup-auto-deploy.sh
```

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

## 6. Frontend + Nginx (required for fast UI)

After first clone (or when switching from S3 to Git):

```bash
cd /root/JIT-PAM-Enterprise
chmod +x scripts/configure-nginx-git.sh
./scripts/configure-nginx-git.sh
```

This configures nginx to serve from the Git frontend with:
- **Static from disk** – JS/CSS/images served by Nginx (not proxied to Flask); uses sendfile for zero-copy
- **gzip** – CSS, JS, fonts compressed 60–80%; faster load
- **cache** – static assets 7d, `immutable`; fewer requests on scroll
- **open_file_cache** – cached file descriptors; less disk I/O
- **keepalive** – lower API latency

**Verify:** `curl -sI http://YOUR-IP/app.js | grep -E "Content-Encoding|Cache-Control"` → expect `gzip` and `public`

---

## 7. Future: CI/CD

Later you can add GitHub Actions to run `git pull` on EC2 when you push (no SSH needed from your machine).
