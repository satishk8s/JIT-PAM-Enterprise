#!/bin/bash
# Verify what's on S3 after push - run this to debug 404 issues
BUCKET="scptestbucketsatish"
PREFIX="npam"
REGION="ap-south-1"

echo "=== Files on S3 (s3://$BUCKET/$PREFIX/) ==="
aws s3 ls "s3://$BUCKET/$PREFIX/" --region "$REGION" | head -50

echo ""
echo "=== Checking critical files ==="
for f in index.html app.js App.js security-ui-helpers.js; do
  if aws s3 ls "s3://$BUCKET/$PREFIX/$f" --region "$REGION" 2>/dev/null; then
    echo "  ✓ $f exists"
  else
    echo "  ✗ $f MISSING"
  fi
done

