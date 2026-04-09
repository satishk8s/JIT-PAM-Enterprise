# NPAMX Docker Operations and Troubleshooting

This document covers the operational Docker commands used for NPAMX on the PAM EC2.

## Container Names

Current blue-green model:

- `npamx-blue`
- `npamx-green`

Old single-container model:

- `npamx`

## Basic Commands

### Show running containers

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}"
```

### Show all containers

```bash
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

### Stop/remove a container

```bash
docker stop npamx-blue
docker rm npamx-blue
```

### Pull a specific image

```bash
docker pull 116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:v5.8
```

## Logs

### Follow logs

```bash
docker logs -f npamx-blue
```

### Show recent logs

```bash
docker logs --since 10m npamx-blue
```

### Search logs

```bash
docker logs npamx-blue 2>&1 | grep -i "error"
docker logs npamx-blue 2>&1 | grep -i "vault"
docker logs npamx-blue 2>&1 | grep -i "revoke"
```

## Health Checks

### Direct container slot

```bash
curl http://127.0.0.1:5000/health
curl http://127.0.0.1:5001/health
```

### Through nginx

```bash
curl http://127.0.0.1/health
```

## Inspecting a Container

### Exec into the container

```bash
docker exec -it npamx-blue sh
```

### Check Python process inside

```bash
docker exec npamx-blue ps aux
```

### Check AWS identity inside container

```bash
docker exec npamx-blue python -c "import boto3; print(boto3.client('sts', region_name='ap-south-1').get_caller_identity())"
```

### Check environment inside container

```bash
docker exec npamx-blue env | sort
```

## Common Troubleshooting

### 1. Container starts and exits immediately

Check:

```bash
docker logs npamx-blue
```

Common causes:

- missing env vars
- Vault/AWS credential failure
- syntax/runtime error in backend startup

### 2. Health check fails on localhost port

Check:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
docker logs npamx-blue
ss -ltnp | grep -E ':5000|:5001'
```

### 3. Image tag not found

Check:

```bash
docker pull 116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:v5.8
```

If it fails:

- tag was not pushed from Mac
- ECR login or permission issue

### 4. Wrong slot is live

Check nginx upstream:

```bash
cat /etc/nginx/conf.d/npamx_active_upstream.conf
```

### 5. Need to compare blue vs green logs

```bash
docker logs --since 15m npamx-blue
docker logs --since 15m npamx-green
```

### 6. Active request/session state looks wrong

Check SQLite on host:

```bash
sqlite3 /opt/npamx/data/npamx.db "select request_id, status from requests order by created_at desc limit 20;"
sqlite3 /opt/npamx/data/npamx.db "select request_id, db_username, lease_id, expires_at from db_sessions;"
```

### 7. Need DB request credentials failure details

Trigger the action, then check:

```bash
docker logs --since 2m npamx-blue 2>&1 | tail -n 120
docker logs --since 2m npamx-green 2>&1 | tail -n 120
```

### 8. Need revoke failure details

```bash
docker logs npamx-blue 2>&1 | grep -iE "revoke|lease|vault|persist"
docker logs npamx-green 2>&1 | grep -iE "revoke|lease|vault|persist"
```

## Cleanup

### Remove old unused image layers

Use carefully on EC2:

```bash
docker image prune -f
```

### Remove old stopped containers

```bash
docker container prune -f
```

### Host Log Maintenance

If repeated warnings or stack traces start flooding the Docker logs, use the maintenance script in the repo:

```bash
/opt/npamx/scripts/cleanup-host-logs.sh
```

What it does:

- archives and truncates only `npamx-blue`, `npamx-green`, and `npamx` container json logs once they cross the size threshold
- removes archived log files older than the retention window
- vacuums `journalctl` logs to a bounded age and size

Default behavior:

- truncate container logs only when a container log exceeds `200 MB`
- keep archived copies for `7 days`
- vacuum journal logs to `7 days` and `500 MB`

Override defaults with environment variables:

```bash
NPAMX_LOG_CONTAINERS="npamx-blue npamx-green" \
NPAMX_LOG_MAX_MB=150 \
NPAMX_LOG_BACKUP_DIR=/var/log/npamx/docker \
NPAMX_LOG_RETENTION_DAYS=5 \
NPAMX_JOURNAL_VACUUM_TIME=5d \
NPAMX_JOURNAL_VACUUM_SIZE=300M \
/opt/npamx/scripts/cleanup-host-logs.sh
```

Suggested cron entry on the EC2 host:

```bash
*/30 * * * * /opt/npamx/scripts/cleanup-host-logs.sh >> /var/log/npamx/log-cleanup.log 2>&1
```

Recommended install on the host:

```bash
mkdir -p /opt/npamx/scripts /var/log/npamx/docker
cp scripts/cleanup-host-logs.sh /opt/npamx/scripts/cleanup-host-logs.sh
chmod 755 /opt/npamx/scripts/cleanup-host-logs.sh
```

## Operational Notes

- Application data is persisted on the host at `/opt/npamx/data`.
- Container replacement does not remove request history or break-glass DBs as long as the data volume remains mounted.
- For production rollouts, prefer the blue-green script and do not go back to `--network host`.
