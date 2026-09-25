#!/usr/bin/env bash
# Compile first. Packaging consumes the stapled app without rebuilding it.
set -euo pipefail
if [ "$#" -ne 4 ]; then
  echo 'Usage: electron-mac.sh prepare|package <project-dir> <output-dir> <app-name>' >&2
  exit 2
fi
PHASE="$1"
PROJECT="$(cd "$2" && pwd)"
mkdir -p "$3"
OUTPUT="$(cd "$3" && pwd)"
APP="$OUTPUT/mac-arm64/$4.app"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
BUILDER=(node "$(cd "$PROJECT" && node -p 'require.resolve("electron-builder/cli.js")')")
REPO="$(cd "$SCRIPTS/../.." && pwd)"
MANAGER="$(node -p 'require(process.argv[1]).packageManager || ""' "$REPO/package.json")"
if [[ "$MANAGER" == pnpm@* ]]; then
  BUILDER=(pnpm exec electron-builder)
fi
export NOTARIZE_STATE="$OUTPUT/notarize-state.json"
cd "$PROJECT"
case "$PHASE" in
  prepare)
    if [ -e "$APP" ] || [ -e "$NOTARIZE_STATE" ]; then
      echo "Output already contains a candidate; use a new output directory: $OUTPUT" >&2
      exit 1
    fi
    "${BUILDER[@]}" --projectDir "$PROJECT" --mac --arm64 --dir --publish never \
      -c.mac.notarize=false -c.directories.output="$OUTPUT"
    codesign --verify --deep --strict "$APP"
    SIGNATURE="$(codesign -dv --verbose=2 "$APP" 2>&1)"
    [[ "$SIGNATURE" == *'Authority=Developer ID Application:'* ]] || { echo 'Developer ID signature required' >&2; exit 1; }
    mkdir -p "$OUTPUT/submission"
    ditto -c -k --keepParent "$APP" "$OUTPUT/submission/app.zip"
    "$SCRIPTS/notarize.sh" submit --app "$APP" "$OUTPUT/submission/app.zip"
    ;;
  package)
    codesign --verify --deep --strict "$APP"
    xcrun stapler validate "$APP"
    "${BUILDER[@]}" --projectDir "$PROJECT" --mac --arm64 --prepackaged "$APP" --publish never \
      -c.mac.notarize=false -c.directories.output="$OUTPUT/artifacts"
    echo "Submit the DMG next: NOTARIZE_STATE='$NOTARIZE_STATE' $SCRIPTS/notarize.sh submit '$OUTPUT/artifacts/'*.dmg"
    ;;
  *) echo "Unknown phase: $PHASE" >&2; exit 2 ;;
esac
