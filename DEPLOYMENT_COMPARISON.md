# S3 vs Git Deployment – What Changed

## Quick Diagnosis

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cache-Control: no-cache` when testing | **Wrong curl syntax** – space in URL | Use `curl -sI http://IP/app.js` (no space) |
| Square boxes in terminal | **Old frontend** – emoji (✅❌🔹) not supported | Pull latest; terminal now uses ASCII `[OK]`, `[ERROR]`, `>` |
| Icons missing (fa-database, fa-play) | **Font Awesome CDN** slow or blocked | Added preconnect; consider self-host if CDN fails |
| Page still slow | **Nginx config not applied** | Run `./scripts/configure-nginx-git.sh` on EC2 |

---

## S3 Deployment (Before)

```
Mac: push-to-s3.sh  →  S3 bucket (npam/)
EC2: aws s3 sync s3://bucket/npam/ /root/frontend/
EC2: setup-ec2.sh  →  nginx root = /root/frontend
```

- **Source:** `nykaa-jit/frontend/` → S3
- **Web root:** `/root/frontend`
- **Update:** `./push-to-s3.sh` on Mac, then `aws s3 sync` on EC2

---

## Git Deployment (After)

```
Mac: git push origin main
EC2: git pull origin main
EC2: configure-nginx-git.sh  →  nginx root = REPO/frontend
```

- **Source:** Git repo `/root/JIT-PAM-Enterprise/`
- **Web root:** `/root/JIT-PAM-Enterprise/frontend`
- **Update:** `git pull` on EC2; backend auto-restarts

---

## Same Frontend, Different Paths

| Asset | S3 path | Git path |
|-------|---------|----------|
| index.html | /root/frontend/index.html | REPO/frontend/index.html |
| app.js | /root/frontend/app.js | REPO/frontend/app.js |

Structure is identical; only the directory changes.

---

## Which Deployment Am I Using?

On EC2:

```bash
# Git deployment
ls /root/JIT-PAM-Enterprise/frontend/app.js

# S3 deployment
ls /root/frontend/app.js
```

Nginx config:

```bash
grep "root" /etc/nginx/conf.d/npam.conf
# Git: root /root/JIT-PAM-Enterprise/frontend;
# S3:  root /root/frontend;
```

---

## Verify Static + Gzip

```bash
# Correct – single URL for app.js
curl -sI http://13.201.116.151/app.js | grep -E "Content-Encoding|Cache-Control|Content-Type"

# Expected for static:
# Content-Type: application/javascript
# Content-Encoding: gzip
# Cache-Control: public, immutable
```

If you see `Cache-Control: no-cache`, you likely hit `/` (index.html). Remove the space before `/app.js`.

---

## Full Refresh (Git Deployment)

```bash
cd /root/JIT-PAM-Enterprise
git pull origin main
sudo ./scripts/configure-nginx-git.sh
```

Then hard-refresh in the browser (Ctrl+Shift+R or Cmd+Shift+R) to avoid cached JS/CSS.
