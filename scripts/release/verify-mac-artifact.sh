#!/usr/bin/env bash
# ============================================================================
# verify-mac-artifact.sh — acceptance gate for a macOS release artifact
# ============================================================================
# Canonical source: peterjthomson/marktext scripts/release/verify-mac-artifact.sh
# Shared verbatim with peterjthomson/ledger and peterjthomson/year-view.
#
# Run this on the artifact you are about to publish — and ideally again on the
# copy you download back from the release. Every check here exists because
# something shipped without it:
#
#   * Ledger 1.5.0's DMG contained `Ledger.app/Ledger.app`. The inner app was
#     perfectly signed, notarized and stapled; the outer one was a folder
#     wearing the extension, so Finder showed a broken item and dragging it to
#     Applications installed something that could not launch. Nothing in the
#     pipeline looked inside the DMG, so nothing caught it.
#   * Oh My Marktext shipped DMG checksums in latest-mac.yml that described the
#     pre-staple bytes, because stapling rewrites the file after
#     electron-builder hashes it.
#
# Usage:
#   verify-mac-artifact.sh --dmg dist/App-1.0.0.dmg --bundle-id com.example.app \
#     [--feed dist/latest-mac.yml] [--zip dist/App-1.0.0-mac.zip]
# ============================================================================

set -euo pipefail

DMG=""
ZIP=""
FEED=""
BUNDLE_ID=""
FAILURES=0
MOUNTED=""

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() {
  printf '  \033[31m✗\033[0m %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}
info() { printf '  · %s\n' "$1"; }

cleanup() {
  [ -n "$MOUNTED" ] && hdiutil detach "$MOUNTED" -quiet 2>/dev/null || true
}
trap cleanup EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --dmg) DMG="$2"; shift 2 ;;
    --zip) ZIP="$2"; shift 2 ;;
    --feed) FEED="$2"; shift 2 ;;
    --bundle-id) BUNDLE_ID="$2"; shift 2 ;;
    *) echo "verify: unknown argument $1" >&2; exit 2 ;;
  esac
done

[ -n "$DMG" ] || { echo "verify: --dmg is required" >&2; exit 2; }
[ -f "$DMG" ] || { echo "verify: no such file: $DMG" >&2; exit 2; }

echo "Verifying $(basename "$DMG")"

# --- the disk image itself -------------------------------------------------
if xcrun stapler validate "$DMG" >/dev/null 2>&1; then
  pass "DMG has a stapled notarization ticket"
else
  fail "DMG is not stapled — offline installs will need to reach Apple to verify"
fi

# Simulate a browser download so Gatekeeper evaluates it the way a user's Mac will.
WORK="$(mktemp -d)"
cp "$DMG" "$WORK/"
QUARANTINED="$WORK/$(basename "$DMG")"
xattr -w com.apple.quarantine "0081;00000000;Verify;" "$QUARANTINED" 2>/dev/null || true
if printf '%s' "$(spctl -a -t open --context context:primary-signature -v "$QUARANTINED" 2>&1 || true)" | grep -q accepted; then
  pass "Gatekeeper accepts the quarantined DMG"
else
  fail "Gatekeeper rejects the quarantined DMG"
fi

# --- what is actually inside it --------------------------------------------
MOUNTED="$(hdiutil attach -nobrowse -readonly "$QUARANTINED" 2>/dev/null |
  awk -F'\t' '/\/Volumes\//{print $NF}' | tail -1)"
[ -n "$MOUNTED" ] || { fail "DMG failed to mount"; echo ""; echo "verify: $FAILURES check(s) failed"; exit 1; }
info "mounted at $MOUNTED"

APP_COUNT="$(find "$MOUNTED" -maxdepth 1 -name "*.app" | wc -l | tr -d ' ')"
if [ "$APP_COUNT" -eq 1 ]; then
  pass "exactly one .app at the volume root"
else
  fail "expected exactly one .app at the volume root, found $APP_COUNT"
fi

APP="$(find "$MOUNTED" -maxdepth 1 -name "*.app" | head -1)"
if [ -n "$APP" ]; then
  # The nesting check: a real bundle has Contents/Info.plist directly inside.
  if [ -f "$APP/Contents/Info.plist" ]; then
    pass "$(basename "$APP") is a well-formed bundle"
  else
    fail "$(basename "$APP") has no Contents/Info.plist — it is a folder, not a bundle"
    if [ -d "$APP/$(basename "$APP")" ]; then
      fail "bundle is nested: $(basename "$APP")/$(basename "$APP") — users get a broken drag-to-Applications"
    fi
  fi

  if [ -n "$BUNDLE_ID" ] && [ -f "$APP/Contents/Info.plist" ]; then
    ACTUAL="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$APP/Contents/Info.plist" 2>/dev/null || echo "")"
    if [ "$ACTUAL" = "$BUNDLE_ID" ]; then
      pass "bundle identifier is $BUNDLE_ID"
    else
      fail "bundle identifier is '$ACTUAL', expected '$BUNDLE_ID'"
    fi
  fi

  if codesign --verify --deep --strict "$APP" 2>/dev/null; then
    pass "code signature is valid (deep, strict)"
  else
    fail "code signature is invalid"
  fi

  SIGN_INFO="$(codesign -dv --verbose=2 "$APP" 2>&1 || true)"
  if printf '%s' "$SIGN_INFO" | grep -q "Authority=Developer ID Application"; then
    pass "signed with a Developer ID Application certificate"
  else
    fail "not signed with a Developer ID Application certificate"
  fi

  if xcrun stapler validate "$APP" >/dev/null 2>&1; then
    pass "app has its own stapled ticket"
  else
    fail "app is not stapled — it will need a network check once copied out of the DMG"
  fi

  if printf '%s' "$(spctl --assess --type execute -v "$APP" 2>&1 || true)" | grep -q accepted; then
    pass "Gatekeeper accepts the app for execution"
  else
    fail "Gatekeeper rejects the app"
  fi
fi

# --- update feed -----------------------------------------------------------
# electron-updater refuses a download whose sha512/size disagree with the feed,
# and stapling changes both after electron-builder writes them.
if [ -n "$FEED" ] && [ -f "$FEED" ]; then
  DIR="$(dirname "$FEED")"
  while read -r url; do
    [ -n "$url" ] || continue
    target="$DIR/$url"
    if [ ! -f "$target" ]; then
      info "feed references $url (not present locally, skipping)"
      continue
    fi
    want_sha="$(python3 - "$FEED" "$url" <<'PY'
import re, sys
feed, url = sys.argv[1:3]
text = open(feed).read()
m = re.search(r'- url: %s\s*\n\s*sha512: (\S+)\s*\n\s*size: (\d+)' % re.escape(url), text)
print(m.group(1) if m else "")
PY
)"
    want_size="$(python3 - "$FEED" "$url" <<'PY'
import re, sys
feed, url = sys.argv[1:3]
text = open(feed).read()
m = re.search(r'- url: %s\s*\n\s*sha512: \S+\s*\n\s*size: (\d+)' % re.escape(url), text)
print(m.group(1) if m else "")
PY
)"
    got_sha="$(openssl dgst -sha512 -binary "$target" | openssl base64 -A)"
    got_size="$(stat -f%z "$target")"
    if [ "$want_sha" = "$got_sha" ] && [ "$want_size" = "$got_size" ]; then
      pass "feed entry matches $url"
    else
      fail "feed entry for $url is stale (size $want_size vs $got_size)"
    fi
  done < <(grep -E '^[[:space:]]+- url: ' "$FEED" | sed -E 's/^[[:space:]]*- url: //')
fi

# --- zip, if the release ships one ----------------------------------------
if [ -n "$ZIP" ] && [ -f "$ZIP" ]; then
  TOP="$(unzip -l "$ZIP" | awk '{print $4}' | grep -E '^[^/]+\.app/' | cut -d/ -f1 | sort -u | wc -l | tr -d ' ')"
  ZIP_LIST="$(unzip -l "$ZIP" 2>/dev/null || true)"
  if [ "$TOP" = "1" ] && printf '%s' "$ZIP_LIST" | grep -q '\.app/Contents/'; then
    pass "zip contains one well-formed .app at its root"
  else
    fail "zip layout is wrong (expected a single <name>.app/Contents/ at the root)"
  fi
fi

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "verify: all checks passed — safe to publish"
else
  echo "verify: $FAILURES check(s) failed — do not publish"
  exit 1
fi
