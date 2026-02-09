#!/bin/bash
# Push nykaa-jit backend to S3 (for EC2 deployment)
# Usage: ./push-backend-to-s3.sh   OR   ./push-backend-to-s3.sh scptestbucketsatish/npam-backend

set -e
REGION="ap-south-1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/backend"

if [ ! -d "$SOURCE" ]; then
  echo "ERROR: nykaa-jit backend not found at $SOURCE"
  exit 1
fi

if [ ! -f "$SOURCE/database_proxy.py" ] || [ ! -f "$SOURCE/sql_enforcer.py" ] || [ ! -f "$SOURCE/app.py" ]; then
  echo "ERROR: Required backend files missing (database_proxy.py, sql_enforcer.py, app.py)"
  exit 1
fi

if [ -n "$1" ]; then
  S3_PATH="$1"
  S3_PATH="${S3_PATH#s3://}"
  S3_PATH="${S3_PATH%/}"
  BUCKET="${S3_PATH%%/*}"
  PREFIX="${S3_PATH#*/}"
else
  BUCKET="scptestbucketsatish"
  PREFIX="npam-backend"
fi

echo "=========================================="
echo "Pushing nykaa-jit backend to S3"
echo "Source: $SOURCE"
echo "Bucket: s3://$BUCKET/$PREFIX/"
echo "Region: $REGION"
echo "=========================================="

aws s3 sync "$SOURCE/" "s3://$BUCKET/$PREFIX/" \
  --region "$REGION" \
  --delete \
  --exclude "*.pyc" \
  --exclude "__pycache__/*" \
  --exclude "venv/*" \
  --exclude ".venv/*" \
  --exclude "*.db" \
  --exclude "*.md" \
  --exclude ".git/*"

echo ""
echo "=========================================="
echo "Done! Backend pushed to s3://$BUCKET/$PREFIX/"
echo "=========================================="
echo ""
echo "On EC2, pull to /root/backend:"
echo "  mkdir -p /root/backend"
echo "  aws s3 sync s3://$BUCKET/$PREFIX/ /root/backend/ --region $REGION --delete"
echo ""

