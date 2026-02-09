#!/bin/bash
# Run this on your Mac to push all changes to S3

set -e
cd "$(dirname "$0")"

echo "=== NPAM Deploy - Pushing to S3 ==="
echo ""

echo "1. Pushing frontend..."
./push-to-s3.sh

echo ""
echo "2. Pushing backend..."
./push-backend-to-s3.sh

echo ""
echo "=== Done! Now on EC2, run: ==="
echo ""
echo "  cd /root/frontend"
echo "  aws s3 sync s3://scptestbucketsatish/npam/ . --region ap-south-1 --delete"
echo ""
echo "  cd /root/backend"
echo "  aws s3 sync s3://scptestbucketsatish/npam-backend/ . --region ap-south-1 --delete"
echo "  ./run-backend-on-ec2.sh"
echo ""
echo "Then hard-refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)"
echo ""
echo "For MySQL access denied: Request NEW database access after deploying."
echo "The backend now creates user for localhost + 127.0.0.1 + %."
echo ""
