# Deployment Notes (Git)

## Quick Diagnosis

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cache-Control: no-cache` when testing | **Wrong curl syntax** – space in URL | Use `curl -sI http://IP/app.js` (no space) |
| Square boxes in terminal | **Old frontend** – emoji not supported | Pull latest; terminal uses ASCII `[OK]`, `[ERROR]`, `>` |
| Icons missing | **Font Awesome CDN** slow | Added preconnect |
| Page still slow | **Nginx config not applied** | Run `./scripts/configure-nginx-git.sh` |
| git pull blocked | **Local changes** | Run `sudo ./scripts/fix-ec2-deploy.sh` |

---

## Verify Static + Gzip

```bash
curl -sI -H "Accept-Encoding: gzip" http://YOUR-IP/app.js | grep -E "Content-Encoding|Cache-Control"
# Expect: Content-Encoding: gzip, Cache-Control: public, immutable
```

---

## Full Refresh

```bash
cd /root/JIT-PAM-Enterprise
sudo ./scripts/fix-ec2-deploy.sh
```

Then hard-refresh browser (Ctrl+Shift+R).
