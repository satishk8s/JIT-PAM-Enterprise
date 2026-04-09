#!/usr/bin/env bash
set -euo pipefail

# Conservative host log cleanup for NPAMX Docker deployments.
# - Archives and truncates only NPAMX container json logs when they exceed a size threshold
# - Removes old archived copies
# - Vacuums systemd journal to bounded age/size
#
# Safe defaults can be overridden with env vars:
#   NPAMX_LOG_CONTAINERS="npamx-blue npamx-green"
#   NPAMX_LOG_MAX_MB=200
#   NPAMX_LOG_BACKUP_DIR=/var/log/npamx/docker
#   NPAMX_LOG_RETENTION_DAYS=7
#   NPAMX_JOURNAL_VACUUM_TIME=7d
#   NPAMX_JOURNAL_VACUUM_SIZE=500M

CONTAINERS="${NPAMX_LOG_CONTAINERS:-npamx-blue npamx-green npamx}"
LOG_MAX_MB="${NPAMX_LOG_MAX_MB:-200}"
BACKUP_DIR="${NPAMX_LOG_BACKUP_DIR:-/var/log/npamx/docker}"
RETENTION_DAYS="${NPAMX_LOG_RETENTION_DAYS:-7}"
JOURNAL_VACUUM_TIME="${NPAMX_JOURNAL_VACUUM_TIME:-7d}"
JOURNAL_VACUUM_SIZE="${NPAMX_JOURNAL_VACUUM_SIZE:-500M}"

timestamp() {
  date +"%Y-%m-%dT%H-%M-%S"
}

file_size_bytes() {
  wc -c < "$1" | tr -d ' '
}

archive_and_truncate() {
  local container_name="$1"
  local log_path="$2"
  local current_size="$3"
  local stamp archive_path

  mkdir -p "$BACKUP_DIR"
  stamp="$(timestamp)"
  archive_path="${BACKUP_DIR}/${container_name}-${stamp}.log"

  cp "$log_path" "$archive_path"
  gzip -f "$archive_path"
  : > "$log_path"

  printf '[npamx-log-cleanup] archived %s (%s bytes) -> %s.gz and truncated source\n' \
    "$container_name" "$current_size" "$archive_path"
}

cleanup_container_logs() {
  local max_bytes
  max_bytes=$((LOG_MAX_MB * 1024 * 1024))

  for container_name in $CONTAINERS; do
    if ! docker ps -a --format '{{.Names}}' | grep -Fxq "$container_name"; then
      continue
    fi

    local log_path
    log_path="$(docker inspect --format '{{.LogPath}}' "$container_name" 2>/dev/null || true)"
    if [[ -z "$log_path" || ! -f "$log_path" ]]; then
      continue
    fi

    local current_size
    current_size="$(file_size_bytes "$log_path")"
    if [[ "$current_size" -ge "$max_bytes" ]]; then
      archive_and_truncate "$container_name" "$log_path" "$current_size"
    fi
  done
}

cleanup_archives() {
  if [[ -d "$BACKUP_DIR" ]]; then
    find "$BACKUP_DIR" -type f -name '*.log.gz' -mtime +"$RETENTION_DAYS" -delete
  fi
}

vacuum_journal() {
  if command -v journalctl >/dev/null 2>&1; then
    journalctl --vacuum-time="$JOURNAL_VACUUM_TIME" >/dev/null 2>&1 || true
    journalctl --vacuum-size="$JOURNAL_VACUUM_SIZE" >/dev/null 2>&1 || true
  fi
}

main() {
  cleanup_container_logs
  cleanup_archives
  vacuum_journal
}

main "$@"
