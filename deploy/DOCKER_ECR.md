# Docker + ECR: One image for frontend + backend

This guide covers building a **security-hardened** Docker image, pushing it to ECR, running it on EC2, and exposing it through an Application Load Balancer.

---

## Full steps (in order)

| Step | Where | What to do |
|------|--------|------------|
| 1 | Your machine / CI | Create ECR repo (if needed), build image, scan (optional), tag, push to ECR. |
| 2 | EC2 | Install Docker, create data/saml dirs and .env, set volume ownership (1000:1000), pull image, run container with `-p 80:5000`. |
| 3 | AWS Console | Create ALB, target group (port 80), health check `/api/health`, register EC2, add listener. |
| 4 | EC2 security group | Allow inbound port 80 from the ALB security group. |
| 5 | EC2 | Set APP_BASE_URL and CORS_ORIGINS in `.env` to `https://npamx.nyk00-int.network`; restart container. |
| 6 | EC2 | Create break-glass user: `docker exec -it npamx python3 /app/backend/add_break_glass_user.py`. |

Details for each step are below.

---

## Security hardening (image and run)

The Dockerfile and image follow these practices:

| Practice | How it's done |
|----------|----------------|
| **Non-root in container** | Process runs as user `npamx` (UID 1000), not root. |
| **Minimal base** | `python:3.12-slim-bookworm` (Debian Bookworm slim) to reduce attack surface. |
| **No secrets in image** | .dockerignore excludes `.env`, `.git`; config and secrets are passed at run via `--env-file` or env. |
| **Latest / secure packages** | requirements.txt uses minimum versions (e.g. Flask>=2.3.3, requests>=2.31.0, gunicorn>=22); rebuild periodically. |
| **No pip cache in image** | `pip install --no-cache-dir` and `rm -rf /root/.cache` keep the image smaller and avoid caching sensitive data. |
| **Production defaults** | `FLASK_ENV=production`, `PYTHONUNBUFFERED=1` set in the image. |

**Optional (recommended):**

- **Scan the image** before push: enable **ECR image scanning** (ECR repo → Scan on push), or run `docker scout quickview npamx:1.0.0` / `trivy image npamx:1.0.0` locally and fix critical/high issues.
- **Secrets:** Prefer AWS Secrets Manager or Parameter Store and inject env at run (e.g. from a sidecar or startup script) instead of a plain `.env` file on disk.

**Volume ownership:** The container runs as UID 1000. On the host, make the volume dirs writable by that user:

```bash
sudo chown -R 1000:1000 /opt/npamx/data /opt/npamx/saml
```

---

## How the image is built (one picture)

- The **Dockerfile** (in the repo root) says: start from a Python image, copy the `backend/` and `frontend/` folders into the image, run `pip install` on `backend/requirements.txt`, then start the app with **Gunicorn**.
- The app process is **`docker_serve:app`**: it’s the same Flask app as in `app.py`, but we use a small wrapper **`docker_serve.py`** that, when `FRONTEND_DIR` is set, serves the frontend (HTML/JS/CSS) from that folder. So **one process** serves both the API and the static frontend; no nginx inside the image.
- **Build** runs on your machine (or CI): `docker build -t npamx:1.0.0 .` produces one image that contains the full app. That image is the “compiled” artifact.
- You **push** that image to ECR, then on the server you **pull** and **run** it. The server never runs Git; it only runs the image, so a new push to the repo does not change the server until you build a new image, push it, and run the new image.

---

## In short

- **Docker image** = a snapshot of your app (code + runtime + dependencies) that can run the same way anywhere.
- **Dockerfile** = a recipe that says how to build that image (base OS, copy files, install deps, run command).
- **ECR** = AWS’s registry where you store images; EC2 (or ECS) then pulls and runs the image. No Git on the server.

You build **one image** that contains both the frontend (HTML/JS/CSS) and the backend (Flask/Gunicorn). At runtime you pass config via **env vars** and keep **data** (e.g. `backend/data/`) in **volumes** so they are not overwritten when you deploy a new image.

---

## Flow (high level)

1. **Build** (on your laptop or CI):  
   `docker build -t npamx:1.0.0 .`  
   This reads the Dockerfile, copies backend + frontend into the image, installs Python deps, and sets the default command to run Gunicorn.

2. **Tag for ECR** (replace account and region):  
   `docker tag npamx:1.0.0 123456789012.dkr.ecr.ap-south-1.amazonaws.com/npamx:1.0.0`

3. **Log in to ECR and push**:  
   `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com`  
   `docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/npamx:1.0.0`

4. **Run on EC2** (or any host):  
   Pull the image and run a container with env vars and volumes. No Git clone; the server only ever runs the image.

So: **build once → push to ECR → run from ECR**. The “compiled” app is the image; there is no separate “compile” step beyond the Docker build.

---

## What goes in the image vs at runtime

| In the image (baked in at build) | At runtime (env + volumes) |
|----------------------------------|----------------------------|
| Frontend (HTML, JS, CSS)         | `FLASK_SECRET_KEY`, `CORS_ORIGINS`, `APP_BASE_URL` |
| Backend (Python, Flask app)      | `SSO_INSTANCE_ARN`, `IDENTITY_STORE_ID`, `SSO_START_URL`, etc. |
| Python deps (requirements.txt)   | `backend/data/` (pam_admins.json, npamx_break_glass.db) |
|                                 | `backend/saml/idp_metadata.xml` |

Secrets and per-env config are **not** in the image; they are provided when you run the container (env file or env vars). Data that must persist (break-glass DB, PAM admins, SAML metadata) are mounted as **volumes** so a new image deploy does not overwrite them.

---

## Step 1: Build, (optional) scan, and push to ECR

**Prereqs:** Docker installed; AWS CLI configured; ECR repository created (e.g. `npamx`).

```bash
# From the repo root (where the Dockerfile is)
docker build -t npamx:1.0.0 .

# Optional: scan for vulnerabilities before push
# docker scout quickview npamx:1.0.0
# or: trivy image npamx:1.0.0

# ECR repo URL (replace account ID and region)
export ECR_URI=123456789012.dkr.ecr.ap-south-1.amazonaws.com/npamx
docker tag npamx:1.0.0 $ECR_URI:1.0.0

# Log in to ECR and push
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com
docker push $ECR_URI:1.0.0
```

Enable **ECR image scanning** in the ECR repository (Scan on push) so every push is scanned automatically.

---

## Step 2: Run the container on EC2

**One-time: create dirs, env file, and set volume ownership**

```bash
sudo mkdir -p /opt/npamx/data /opt/npamx/saml
# Container runs as UID 1000; host dirs must be writable by that user
sudo chown -R 1000:1000 /opt/npamx/data /opt/npamx/saml

# Create .env with: FLASK_SECRET_KEY, CORS_ORIGINS, APP_BASE_URL, PAM_SUPER_ADMIN_SEED_EMAIL, SSO_INSTANCE_ARN, IDENTITY_STORE_ID, SSO_START_URL, etc.
# Copy idp_metadata.xml to /opt/npamx/saml/
```

**Pull and run** (replace `YOUR_ECR_URI` with your image, e.g. `123456789012.dkr.ecr.ap-south-1.amazonaws.com/npamx`):

```bash
# Login to ECR on EC2 (use same region and account as push)
aws ecr get-login-password --region ap-south-1 | sudo docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com

# Expose container port 5000 as host port 80 (so ALB can target port 80)
sudo docker run -d --name npamx -p 80:5000 \
  --restart unless-stopped \
  --env-file /opt/npamx/.env \
  -v /opt/npamx/data:/app/backend/data \
  -v /opt/npamx/saml:/app/backend/saml \
  YOUR_ECR_URI:1.0.0
```

If you prefer the host to listen on 5000 (and ALB targets 5000), use `-p 5000:5000` instead of `-p 80:5000`.

**If `-p 80:5000` fails from the internet/ALB (timeout) but a non-Docker process on port 80 works:**  
Docker’s iptables (PREROUTING DNAT + FORWARD) can block or misroute external traffic to the published port. Use **nginx on the host** on port 80 and expose the container only on 5000:

```bash
# Container: bind only host port 5000
sudo docker run -d --name npamx -p 5000:5000 \
  --restart unless-stopped \
  --env-file /opt/npamx/.env \
  -v /opt/npamx/data:/app/backend/data \
  -v /opt/npamx/saml:/app/backend/saml \
  YOUR_ECR_URI:1.0.0
```

Then install nginx and proxy to the container (see **Nginx on host (when -p 80:5000 fails)** below). ALB and security group still use **port 80** (nginx).

**Create break-glass user (one-time, after first run)**

```bash
docker exec -it npamx python3 /app/backend/add_break_glass_user.py
# Or run a one-off container with the same volumes:
docker run --rm -it \
  -v /opt/npamx/data:/app/backend/data \
  -e EMAIL=admin@company.com -e PASSWORD=your-secure-password \
  YOUR_ECR_URI:1.0.0 \
  python3 /app/backend/add_break_glass_user.py
```

---

## Nginx on host (when -p 80:5000 fails)

If traffic to the instance on port 80 times out when Docker owns 80 but works when another process (e.g. Python) listens on 80, use nginx on the host and expose the container on 5000 only.

1. **Run the container with port 5000 only:** `-p 5000:5000` (see above).
2. **Install and enable nginx** (if not already):  
   `sudo apt-get update && sudo apt-get install -y nginx && sudo systemctl enable nginx`
3. **Configure nginx** to proxy to the container:

```bash
sudo tee /etc/nginx/sites-available/npamx << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    location / {
        proxy_pass http://127.0.0.1:5000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /saml/ {
        proxy_pass http://127.0.0.1:5000/saml/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /login {
        proxy_pass http://127.0.0.1:5000/login;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

```bash
sudo ln -sf /etc/nginx/sites-available/npamx /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

4. **ALB and security group:** keep target port **80** (nginx). No change needed.

---

## Expose through Application Load Balancer (ALB)

Use an **Application Load Balancer** so users hit a single URL (e.g. `https://pam.example.com`) and the ALB forwards traffic to the container(s) on EC2.

### 1. ALB and target group (AWS Console or CLI)

| Step | What to do |
|------|------------|
| **ALB** | EC2 → Load Balancers → Create → Application Load Balancer, internet-facing, in your VPC (at least 2 subnets). |
| **Security group (ALB)** | Allow **inbound 80** (and 443 if using HTTPS) from `0.0.0.0/0`. |
| **Target group** | Target type: **Instances**. Protocol: **HTTP**. Port: **80** (if you ran the container with `-p 80:5000`) or **5000** (if `-p 5000:5000`). |
| **Health check** | Protocol: HTTP. Path: `/api/health` or `/`. Port: same as target port (80 or 5000). Success codes: 200. |
| **Register target** | Add your EC2 instance to the target group (same port as above). |
| **Listener** | ALB → Listeners → Add listener: HTTP 80 → Forward to the target group. (Add HTTPS 443 later if you have a certificate.) |

### 2. EC2 security group

The **instance** security group must allow **inbound traffic from the ALB** on the port the container exposes:

- If container is `-p 80:5000`: allow **inbound port 80** from the **ALB security group**.
- If container is `-p 5000:5000`: allow **inbound port 5000** from the **ALB security group**.

Without this, the ALB health check will fail and the target will show unhealthy.

### 3. .env for external URL

Set **APP_BASE_URL** and **CORS_ORIGINS** to the public PAM hostname. Current target:

- `APP_BASE_URL=https://npamx.nyk00-int.network`
- `CORS_ORIGINS=https://npamx.nyk00-int.network`

For IAM Identity Center SAML, the derived values are:

- ACS URL: `https://npamx.nyk00-int.network/saml/acs`
- Audience / Entity ID: `https://npamx.nyk00-int.network/saml/metadata`

Then restart the container so the app uses the correct URL for redirects and CORS.

### 4. Flow

```
User → ALB (port 80/443) → Target group (EC2:80 or EC2:5000) → Docker (host port 80 or 5000) → Container (5000)
```

---

## Quick checklist: Docker + ALB

1. **Build & push:** `docker build -t npamx:1.0.0 .` → tag → ECR login → `docker push`.
2. **EC2:** Install Docker, create `/opt/npamx/data`, `/opt/npamx/saml`, `.env`; pull image; `docker run -d --name npamx -p 80:5000 ...`.
3. **ALB:** Create ALB + target group (port 80), health check `/api/health`, register EC2; add listener HTTP 80 → target group.
4. **EC2 SG:** Allow inbound port 80 from ALB security group.
5. **.env:** Set `APP_BASE_URL` and `CORS_ORIGINS` to `https://npamx.nyk00-int.network`; restart container.
6. **Break-glass user:** `docker exec -it npamx python3 /app/backend/add_break_glass_user.py`.

---

## Summary

- **One image** = frontend + backend “compiled” into a single runnable artifact.
- **Dockerfile** defines how that image is built; **build** produces the image; **push to ECR** stores it; **run** starts the app from the image with env and volumes.
- **ALB** fronts the EC2 instance; target group port = host port (80 or 5000); instance SG allows that port from the ALB.
- No Git on the server: you only pull and run the image. Config and data stay in env and volumes.
