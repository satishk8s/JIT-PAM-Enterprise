# NPAMX Blue-Green Deployment Runbook

This runbook matches the current repository state.

Deployment model on the PAM EC2:

- nginx runs on the host
- one Docker container serves both:
  - main NPAMX app on container port `5000`
  - S3 Explorer on container port `8001`
- blue slot maps to host ports `5000` and `8001`
- green slot maps to host ports `5001` and `8002`

nginx switches traffic by reading:

- `/etc/nginx/conf.d/npamx_active_upstream.conf`
- `/etc/nginx/conf.d/npamx_active_s3_upstream.conf`

Example active files:

```nginx
set $npamx_upstream http://127.0.0.1:5000;
```

```nginx
set $npamx_s3_upstream http://127.0.0.1:8001;
```

## Why This Exists

Do not deploy with:

```bash
docker stop npamx
docker rm npamx
docker run ...
```

That replaces the only live container in place and causes visible interruption.

The blue-green model:

1. starts the candidate image on the inactive slot
2. health-checks it first
3. switches nginx only after the candidate is healthy
4. keeps the previous slot available for rollback

## Prerequisites

On the PAM EC2:

- Docker installed and working
- nginx installed and working
- `/etc/npamx/npamx.env` present
- `/etc/npamx/certs` present
- `/etc/npamx/certs/vault-ca.pem` present
- `/opt/npamx/data` present
- ECR pull access already working

## One-Time Setup

### 1. Put the nginx config in place

Use the repository file:

```bash
sudo cp /path/to/JIT-PAM-Enterprise/deploy/nginx-npamx-bluegreen.conf /etc/nginx/sites-available/npamx.conf
sudo ln -sfn /etc/nginx/sites-available/npamx.conf /etc/nginx/sites-enabled/npamx.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

### 2. Create the initial active upstream files

```bash
cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_upstream.conf >/dev/null
set $npamx_upstream http://127.0.0.1:5000;
EOF
```

```bash
cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_s3_upstream.conf >/dev/null
set $npamx_s3_upstream http://127.0.0.1:8001;
EOF
```

### 3. Validate nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Stop old containers

```bash
docker stop npamx || true
docker rm npamx || true
docker stop npamx-blue || true
docker rm npamx-blue || true
docker stop npamx-green || true
docker rm npamx-green || true
```

### 5. Start the first blue slot

Replace the image tag with the current production image:

```bash
docker run -d \
  --name npamx-blue \
  --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  -p 127.0.0.1:8001:8001 \
  --env-file /etc/npamx/npamx.env \
  -v /etc/npamx/certs:/etc/npamx/certs:ro \
  -v /opt/npamx/data:/app/backend/data \
  116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:vX.Y
```

### 6. Verify the first slot

```bash
curl http://127.0.0.1:5000/health
curl http://127.0.0.1/health
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
cat /etc/nginx/conf.d/npamx_active_upstream.conf
cat /etc/nginx/conf.d/npamx_active_s3_upstream.conf
```

Expected:

- main app health returns OK
- nginx health returns OK
- upstream points to `5000`
- S3 upstream points to `8001`

## Reusable Deployment Script

Copy the repo script to the EC2 or place it directly as:

```bash
/root/run-docker-bluegreen.sh
```

Use the current repository version:

- `scripts/run-docker-bluegreen.sh`

Make it executable:

```bash
chmod +x /root/run-docker-bluegreen.sh
```

## Normal Release Flow

### 1. Build and push from your Mac

```bash
docker buildx build \
  --platform linux/amd64 \
  -t 116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:vX.Y \
  --push \
  .
```

### 2. Deploy on PAM EC2

```bash
IMAGE_URI=116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:vX.Y /root/run-docker-bluegreen.sh
```

What the script does:

- detects the live app slot
- chooses the inactive app slot and matching S3 slot
- starts the candidate container with both port mappings
- waits for `/health`
- updates both nginx active upstream files
- reloads nginx
- keeps the previous container for rollback

### 3. Verify

```bash
curl http://127.0.0.1/health
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
cat /etc/nginx/conf.d/npamx_active_upstream.conf
cat /etc/nginx/conf.d/npamx_active_s3_upstream.conf
```

## Rollback

### Roll back to blue

```bash
cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_upstream.conf >/dev/null
set $npamx_upstream http://127.0.0.1:5000;
EOF

cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_s3_upstream.conf >/dev/null
set $npamx_s3_upstream http://127.0.0.1:8001;
EOF

sudo nginx -t
sudo systemctl reload nginx
```

### Roll back to green

```bash
cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_upstream.conf >/dev/null
set $npamx_upstream http://127.0.0.1:5001;
EOF

cat <<'EOF' | sudo tee /etc/nginx/conf.d/npamx_active_s3_upstream.conf >/dev/null
set $npamx_s3_upstream http://127.0.0.1:8002;
EOF

sudo nginx -t
sudo systemctl reload nginx
```

## Troubleshooting

### `/health` fails on the candidate slot

Check:

```bash
docker logs npamx-blue
docker logs npamx-green
```

Common causes:

- bad env var
- bad secret value
- container failed before Gunicorn started

### `/s3/` returns `502`

Check:

```bash
cat /etc/nginx/conf.d/npamx_active_s3_upstream.conf
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
docker logs npamx-blue
docker logs npamx-green
```

Common causes:

- candidate container did not expose the expected S3 slot port
- `uvicorn`/`s3_app.py` failed to start inside the container
- nginx still points to the wrong S3 slot

### nginx reload fails

Check:

```bash
sudo nginx -t
```

Then inspect:

- `/etc/nginx/sites-available/npamx.conf`
- `/etc/nginx/conf.d/npamx_active_upstream.conf`
- `/etc/nginx/conf.d/npamx_active_s3_upstream.conf`

### Only one container is up

That is acceptable immediately after the first setup. During later deploys, both slots should normally exist unless you manually removed the previous one.
