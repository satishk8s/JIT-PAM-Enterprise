#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <bucket-name> <region> [prefix]"
  echo "Example: $0 npamx-agent-bucket ap-south-1 desktop-agent/v1.0.0"
  exit 1
fi

BUCKET="$1"
REGION="$2"
PREFIX="${3:-desktop-agent/latest}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/desktop_agent/dist-artifacts"

if [[ ! -d "${ARTIFACT_DIR}" ]]; then
  echo "Artifact directory not found: ${ARTIFACT_DIR}"
  exit 1
fi

echo "Uploading artifacts from ${ARTIFACT_DIR} to s3://${BUCKET}/${PREFIX}/"
aws s3 cp "${ARTIFACT_DIR}/" "s3://${BUCKET}/${PREFIX}/" --recursive --region "${REGION}"

echo
echo "Suggested URLs for NPAMX admin settings:"
for f in "${ARTIFACT_DIR}"/*; do
  base="$(basename "$f")"
  echo "https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/${base}"
done
