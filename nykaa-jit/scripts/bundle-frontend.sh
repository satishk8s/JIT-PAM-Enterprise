#!/bin/bash
# Bundle CSS and JS to reduce requests (38+ → 4). Run before deploy.
# Output: frontend/bundle.css, frontend/bundle.js

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$DIR/frontend"
cd "$FRONTEND"

echo "Bundling CSS..."
cat enterprise-theme.css styles.css design-system.css dark-theme-fix.css security-ui.css \
    unified-assistant.css workflow-designer.css vendor-icons.css databases.css \
    terminal-page.css performance.css calendar.css instances.css toggle-switch.css \
    s3-explorer.css > bundle.css

echo "Bundling JS..."
cat calendar.js wizard.js policy-config.js policy-toggles.js policy-builder.js \
    feature-management.js admin-functions.js security-management.js guardrails.js \
    request-drafts.js account-tagging.js instances.js databases.js terminal-page.js \
    s3-explorer.js security-ui-helpers.js unified-assistant.js workflow-designer.js \
    app.js > bundle.js

echo "Done. bundle.css ($(wc -c < bundle.css) bytes), bundle.js ($(wc -c < bundle.js) bytes)"
echo "Use index-bundled.html for fast load."
