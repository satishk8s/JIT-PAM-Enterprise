#!/usr/bin/env bash
set -euo pipefail

# Host-side launcher for the PAM EC2.
# Fetches sensitive runtime values from Secrets Manager on the EC2 host and
# injects them into docker run without storing the secret values inside the image.

IMAGE_URI="${IMAGE_URI:-116155851700.dkr.ecr.ap-south-1.amazonaws.com/npamx:v1.1}"
CONTAINER_NAME="${CONTAINER_NAME:-npamx}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
ENV_FILE="${ENV_FILE:-/etc/npamx/npamx.env}"
CERTS_DIR="${CERTS_DIR:-/etc/npamx/certs}"
DATA_DIR="${DATA_DIR:-/opt/npamx/data}"

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

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  -e "AWS_REGION=$AWS_REGION" \
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

echo "Started $CONTAINER_NAME from $IMAGE_URI"
