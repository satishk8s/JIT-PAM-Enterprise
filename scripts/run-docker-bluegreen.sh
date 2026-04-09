#!/usr/bin/env bash
set -euo pipefail

# Zero-downtime blue-green Docker deployment for the PAM EC2.
# It starts the candidate on the inactive localhost port, health-checks it,
# switches nginx traffic, and keeps the previous slot available for rollback.

IMAGE_URI="${IMAGE_URI:-116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:latest}"
CONTAINER_BASENAME="${CONTAINER_BASENAME:-npamx}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ENV_FILE="${ENV_FILE:-/etc/npamx/npamx.env}"
CERTS_DIR="${CERTS_DIR:-/etc/npamx/certs}"
DATA_DIR="${DATA_DIR:-/opt/npamx/data}"
BLUE_PORT="${BLUE_PORT:-5000}"
GREEN_PORT="${GREEN_PORT:-5001}"
S3_BLUE_PORT="${S3_BLUE_PORT:-8001}"
S3_GREEN_PORT="${S3_GREEN_PORT:-8002}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-3}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
NGINX_ACTIVE_UPSTREAM_FILE="${NGINX_ACTIVE_UPSTREAM_FILE:-/etc/nginx/conf.d/npamx_active_upstream.conf}"
NGINX_ACTIVE_S3_UPSTREAM_FILE="${NGINX_ACTIVE_S3_UPSTREAM_FILE:-/etc/nginx/conf.d/npamx_active_s3_upstream.conf}"
KEEP_PREVIOUS="${KEEP_PREVIOUS:-true}"

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

secret_value() {
  local secret_id="$1"
  aws secretsmanager get-secret-value \
    --secret-id "$secret_id" \
    --query SecretString \
    --output text \
    --region "$AWS_REGION"
}

active_port_from_nginx() {
  if [[ -f "$NGINX_ACTIVE_UPSTREAM_FILE" ]]; then
    grep -Eo '127\.0\.0\.1:[0-9]+' "$NGINX_ACTIVE_UPSTREAM_FILE" | tail -n1 | cut -d: -f2
    return 0
  fi
  return 1
}

container_name_for_port() {
  local port="$1"
  if [[ "$port" == "$BLUE_PORT" ]]; then
    echo "${CONTAINER_BASENAME}-blue"
  else
    echo "${CONTAINER_BASENAME}-green"
  fi
}

run_nginx_reload() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
}

wait_for_health() {
  local port="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    if curl -fsS "http://127.0.0.1:${port}${HEALTH_PATH}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

require_file "$ENV_FILE"
require_file "$CERTS_DIR/vault-ca.pem"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

FLASK_SECRET_KEY_RUNTIME="${FLASK_SECRET_KEY:-}"
if [[ -z "$FLASK_SECRET_KEY_RUNTIME" && -n "${FLASK_SECRET_KEY_SECRET_NAME:-}" ]]; then
  FLASK_SECRET_KEY_RUNTIME="$(secret_value "$FLASK_SECRET_KEY_SECRET_NAME")"
fi

VAULT_ROLE_ID_RUNTIME="${VAULT_ROLE_ID_NONPROD:-}"
if [[ -z "$VAULT_ROLE_ID_RUNTIME" && -n "${VAULT_ROLE_ID_SECRET_NAME_NONPROD:-}" ]]; then
  VAULT_ROLE_ID_RUNTIME="$(secret_value "$VAULT_ROLE_ID_SECRET_NAME_NONPROD")"
fi

VAULT_SECRET_ID_RUNTIME="${VAULT_SECRET_ID_NONPROD:-}"
if [[ -z "$VAULT_SECRET_ID_RUNTIME" && -n "${VAULT_SECRET_ID_SECRET_NAME_NONPROD:-}" ]]; then
  VAULT_SECRET_ID_RUNTIME="$(secret_value "$VAULT_SECRET_ID_SECRET_NAME_NONPROD")"
fi

SSO_INSTANCE_ARN_RUNTIME="${SSO_INSTANCE_ARN:-}"
if [[ -z "$SSO_INSTANCE_ARN_RUNTIME" && -n "${SSO_INSTANCE_ARN_SECRET_NAME:-}" ]]; then
  SSO_INSTANCE_ARN_RUNTIME="$(secret_value "$SSO_INSTANCE_ARN_SECRET_NAME")"
fi

IDENTITY_STORE_ID_RUNTIME="${IDENTITY_STORE_ID:-}"
if [[ -z "$IDENTITY_STORE_ID_RUNTIME" && -n "${IDENTITY_STORE_ID_SECRET_NAME:-}" ]]; then
  IDENTITY_STORE_ID_RUNTIME="$(secret_value "$IDENTITY_STORE_ID_SECRET_NAME")"
fi

SSO_START_URL_RUNTIME="${SSO_START_URL:-}"
if [[ -z "$SSO_START_URL_RUNTIME" && -n "${SSO_START_URL_SECRET_NAME:-}" ]]; then
  SSO_START_URL_RUNTIME="$(secret_value "$SSO_START_URL_SECRET_NAME")"
fi

SAML_IDP_METADATA_XML_RUNTIME="${SAML_IDP_METADATA_XML:-}"
if [[ -z "$SAML_IDP_METADATA_XML_RUNTIME" && -n "${SAML_IDP_METADATA_XML_SECRET_NAME:-}" ]]; then
  SAML_IDP_METADATA_XML_RUNTIME="$(secret_value "$SAML_IDP_METADATA_XML_SECRET_NAME")"
fi

DB_PROXY_INTERNAL_TOKEN_RUNTIME="${DB_PROXY_INTERNAL_TOKEN:-}"
if [[ -z "$DB_PROXY_INTERNAL_TOKEN_RUNTIME" && -n "${DB_PROXY_INTERNAL_TOKEN_SECRET_NAME:-}" ]]; then
  DB_PROXY_INTERNAL_TOKEN_RUNTIME="$(secret_value "$DB_PROXY_INTERNAL_TOKEN_SECRET_NAME")"
fi

CURRENT_ACTIVE_PORT="$(active_port_from_nginx || true)"
if [[ -z "$CURRENT_ACTIVE_PORT" ]]; then
  CURRENT_ACTIVE_PORT="$BLUE_PORT"
fi

if [[ "$CURRENT_ACTIVE_PORT" == "$BLUE_PORT" ]]; then
  CANDIDATE_PORT="$GREEN_PORT"
else
  CANDIDATE_PORT="$BLUE_PORT"
fi

CANDIDATE_CONTAINER="$(container_name_for_port "$CANDIDATE_PORT")"
PREVIOUS_CONTAINER="$(container_name_for_port "$CURRENT_ACTIVE_PORT")"
if [[ "$CANDIDATE_PORT" == "$BLUE_PORT" ]]; then
  CANDIDATE_S3_PORT="$S3_BLUE_PORT"
else
  CANDIDATE_S3_PORT="$S3_GREEN_PORT"
fi

echo "Active slot port: $CURRENT_ACTIVE_PORT"
echo "Candidate slot port: $CANDIDATE_PORT"
echo "Candidate S3 slot port: $CANDIDATE_S3_PORT"
echo "Candidate container: $CANDIDATE_CONTAINER"

docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$CANDIDATE_CONTAINER" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  -e "AWS_REGION=$AWS_REGION" \
  -e "APP_PORT=$CANDIDATE_PORT" \
  -e "S3_PORT=$CANDIDATE_S3_PORT" \
  -e "FLASK_SECRET_KEY=$FLASK_SECRET_KEY_RUNTIME" \
  -e "VAULT_ROLE_ID_NONPROD=$VAULT_ROLE_ID_RUNTIME" \
  -e "VAULT_SECRET_ID_NONPROD=$VAULT_SECRET_ID_RUNTIME" \
  -e "SSO_INSTANCE_ARN=$SSO_INSTANCE_ARN_RUNTIME" \
  -e "IDENTITY_STORE_ID=$IDENTITY_STORE_ID_RUNTIME" \
  -e "SSO_START_URL=$SSO_START_URL_RUNTIME" \
  -e "SAML_IDP_METADATA_XML=$SAML_IDP_METADATA_XML_RUNTIME" \
  -e "DB_PROXY_INTERNAL_TOKEN=$DB_PROXY_INTERNAL_TOKEN_RUNTIME" \
  -v "$CERTS_DIR:$CERTS_DIR:ro" \
  -v "$DATA_DIR:/app/backend/data" \
  "$IMAGE_URI"

if ! wait_for_health "$CANDIDATE_PORT"; then
  echo "Candidate failed health check on port $CANDIDATE_PORT" >&2
  docker logs "$CANDIDATE_CONTAINER" || true
  exit 1
fi

PREVIOUS_UPSTREAM_CONTENT=""
if [[ -f "$NGINX_ACTIVE_UPSTREAM_FILE" ]]; then
  PREVIOUS_UPSTREAM_CONTENT="$(cat "$NGINX_ACTIVE_UPSTREAM_FILE")"
fi
PREVIOUS_S3_UPSTREAM_CONTENT=""
if [[ -f "$NGINX_ACTIVE_S3_UPSTREAM_FILE" ]]; then
  PREVIOUS_S3_UPSTREAM_CONTENT="$(cat "$NGINX_ACTIVE_S3_UPSTREAM_FILE")"
fi

mkdir -p "$(dirname "$NGINX_ACTIVE_UPSTREAM_FILE")"
printf 'set $npamx_upstream http://127.0.0.1:%s;\n' "$CANDIDATE_PORT" > "$NGINX_ACTIVE_UPSTREAM_FILE"
mkdir -p "$(dirname "$NGINX_ACTIVE_S3_UPSTREAM_FILE")"
printf 'set $npamx_s3_upstream http://127.0.0.1:%s;\n' "$CANDIDATE_S3_PORT" > "$NGINX_ACTIVE_S3_UPSTREAM_FILE"

if ! nginx -t; then
  if [[ -n "$PREVIOUS_UPSTREAM_CONTENT" ]]; then
    printf '%s\n' "$PREVIOUS_UPSTREAM_CONTENT" > "$NGINX_ACTIVE_UPSTREAM_FILE"
  fi
  if [[ -n "$PREVIOUS_S3_UPSTREAM_CONTENT" ]]; then
    printf '%s\n' "$PREVIOUS_S3_UPSTREAM_CONTENT" > "$NGINX_ACTIVE_S3_UPSTREAM_FILE"
  fi
  echo "nginx config test failed; restored previous upstream file." >&2
  exit 1
fi

run_nginx_reload

if ! curl -fsS "http://127.0.0.1${HEALTH_PATH}" >/dev/null 2>&1; then
  if [[ -n "$PREVIOUS_UPSTREAM_CONTENT" ]]; then
    printf '%s\n' "$PREVIOUS_UPSTREAM_CONTENT" > "$NGINX_ACTIVE_UPSTREAM_FILE"
  fi
  if [[ -n "$PREVIOUS_S3_UPSTREAM_CONTENT" ]]; then
    printf '%s\n' "$PREVIOUS_S3_UPSTREAM_CONTENT" > "$NGINX_ACTIVE_S3_UPSTREAM_FILE"
  fi
  nginx -t >/dev/null 2>&1 || true
  run_nginx_reload || true
  echo "Traffic switch verification failed; restored previous upstream." >&2
  exit 1
fi

if [[ "${KEEP_PREVIOUS,,}" != "true" ]]; then
  docker rm -f "$PREVIOUS_CONTAINER" >/dev/null 2>&1 || true
fi

echo "Blue-green deployment complete."
echo "Active upstream: http://127.0.0.1:${CANDIDATE_PORT}"
echo "Active S3 upstream: http://127.0.0.1:${CANDIDATE_S3_PORT}"
echo "Live container: $CANDIDATE_CONTAINER"
if [[ "${KEEP_PREVIOUS,,}" == "true" ]]; then
  echo "Previous container kept for rollback: $PREVIOUS_CONTAINER"
fi
