# NPAMX Release Cheat Sheet

Use this after blue-green setup is already complete on the PAM EC2.

Current model:

- blue app slot: `127.0.0.1:5000`
- blue S3 slot: `127.0.0.1:8001`
- green app slot: `127.0.0.1:5001`
- green S3 slot: `127.0.0.1:8002`

nginx reads the live slots from:

- `/etc/nginx/conf.d/npamx_active_upstream.conf`
- `/etc/nginx/conf.d/npamx_active_s3_upstream.conf`

## 1. Build and Push

```bash
docker buildx build \
  --platform linux/amd64 \
  -t 116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:vX.Y \
  --push \
  /Users/sowmya/Documents/sso/JIT-PAM-Enterprise
```

## 2. Deploy on PAM EC2

```bash
IMAGE_URI=116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:vX.Y /root/run-docker-bluegreen.sh
```

## 3. Verify

```bash
curl http://127.0.0.1/health
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
cat /etc/nginx/conf.d/npamx_active_upstream.conf
cat /etc/nginx/conf.d/npamx_active_s3_upstream.conf
```

Expected:

- health returns OK
- both `npamx-blue` and `npamx-green` may be present
- app upstream points to either `5000` or `5001`
- S3 upstream points to either `8001` or `8002`

## 4. Logs

```bash
docker logs --since 5m npamx-blue
docker logs --since 5m npamx-green
```

## 5. Roll Back to Blue

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

## 6. Roll Back to Green

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

## Common Mistakes

- Do not type `:<new-tag>` literally. Use a real image tag.
- Do not go back to in-place restarts with `docker stop npamx` and `docker run --network host`.
- If `/s3/` returns `502`, check the active S3 upstream file and the mapped container ports first.
