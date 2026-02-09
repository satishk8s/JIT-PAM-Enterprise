#!/bin/bash
# Push nykaa-jit frontend to S3 (npam bucket)
# ALWAYS pushes nykaa-jit/frontend (NPAMX) - regardless of where you run from
# Usage: ./push-to-s3.sh   OR   ./push-to-s3.sh scptestbucketsatish/npam

set -e
REGION="ap-south-1"

# Use script's directory so we ALWAYS push nykaa-jit/frontend (not sso/frontend!)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$SCRIPT_DIR/frontend"

if [ ! -d "$SOURCE" ]; then
  echo "ERROR: nykaa-jit frontend not found at $SOURCE"
  exit 1
fi

# Parse optional argument (e.g. scptestbucketsatish/npam)
if [ -n "$1" ]; then
  S3_PATH="$1"
  S3_PATH="${S3_PATH#s3://}"           # strip s3:// if present
  S3_PATH="${S3_PATH%/}"               # strip trailing slash
  BUCKET="${S3_PATH%%/*}"
  PREFIX="${S3_PATH#*/}"
else
  BUCKET="scptestbucketsatish"
  PREFIX="npam"
fi

echo "=========================================="
echo "Pushing nykaa-jit (NPAMX) to S3"
echo "Source: $SOURCE"
echo "Bucket: s3://$BUCKET/$PREFIX/"
echo "Region: $REGION"
echo "=========================================="
# Verify we're pushing NPAMX, not GovernAIX
if grep -q "GovernAIX" "$SOURCE/index.html" 2>/dev/null; then
  echo "ERROR: index.html contains GovernAIX - wrong source! Should be nykaa-jit (NPAMX)"
  exit 1
fi
echo "✓ Confirmed: NPAMX branding"
echo ""

# Push frontend contents to S3 (files at root of npam/)
aws s3 sync "$SOURCE/" "s3://$BUCKET/$PREFIX/" \
  --region "$REGION" \
  --delete \
  --exclude "*.bak" \
  --exclude "*.md" \
  --exclude "node_modules/*" \
  --exclude ".git/*"

# CRITICAL: Ensure app.js exists with lowercase name (S3/Linux are case-sensitive)
# macOS may sync as App.js; HTML requests app.js - must match exactly
SRC_APP="$SOURCE/app.js"
[ -f "$SOURCE/App.js" ] && SRC_APP="$SOURCE/App.js"
if [ -f "$SRC_APP" ]; then
  echo "Ensuring app.js (lowercase) on S3..."
  aws s3 cp "$SRC_APP" "s3://$BUCKET/$PREFIX/app.js" --region "$REGION"
fi

# Include setup-ec2.sh so it's available when syncing frontend on EC2
if [ -f "$SCRIPT_DIR/setup-ec2.sh" ]; then
  echo "Pushing setup-ec2.sh..."
  aws s3 cp "$SCRIPT_DIR/setup-ec2.sh" "s3://$BUCKET/$PREFIX/setup-ec2.sh" --region "$REGION"
fi

echo ""
echo "=========================================="
echo "Done! Code pushed to s3://$BUCKET/$PREFIX/"
echo "=========================================="
echo ""
echo "To pull on EC2 instance:"
echo "  aws s3 sync s3://$BUCKET/$PREFIX/ . --region $REGION --delete"
echo ""

