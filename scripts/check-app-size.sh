#!/bin/bash
# Check that the built app isn't accidentally bloated
# Expected size: ~250-350MB for Electron app with frameworks

MAX_SIZE_MB=500
APP_PATH="dist/mac-arm64/Ledger.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App not found at $APP_PATH"
    exit 1
fi

# Get size in MB
SIZE_BYTES=$(du -sk "$APP_PATH" | cut -f1)
SIZE_MB=$((SIZE_BYTES / 1024))

echo "📦 App size: ${SIZE_MB}MB"

if [ "$SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
    echo "❌ ERROR: App is ${SIZE_MB}MB - exceeds ${MAX_SIZE_MB}MB limit!"
    echo ""
    echo "🔍 Checking what's taking space..."
    echo ""
    du -sh "$APP_PATH/Contents/"* | sort -hr | head -5
    echo ""
    echo "This usually means large folders (wip/, dist/, node_modules/) got bundled."
    echo "Check electron-builder.yml 'files' exclusions."
    exit 1
fi

echo "✅ App size OK (under ${MAX_SIZE_MB}MB)"
