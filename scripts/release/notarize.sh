#!/usr/bin/env bash
# ============================================================================
# notarize.sh — detached macOS notarization
# ============================================================================
# Canonical source: peterjthomson/marktext scripts/release/notarize.sh
# Shared verbatim with peterjthomson/ledger and peterjthomson/year-view.
#
# WHY THIS IS NOT `notarytool submit --wait`
#
# Apple's notary service is usually minutes and occasionally *over a day*. A
# build that blocks on `--wait` turns that into a lost build: the terminal is
# stuck, CI times out, and the human works around it by hand — which is how a
# release ends up assembled manually and, eventually, shipped broken.
#
# So submission and collection are separate commands with state on disk:
#
#   ./notarize.sh submit dist/*.dmg   # returns as soon as the upload is done
#   ./notarize.sh status              # safe to run a minute or a week later
#   ./notarize.sh staple              # staples everything Apple has Accepted
#
# The build is never held hostage. If Apple takes 26 hours, you run `status`
# tomorrow and `staple` when it clears; nothing needs rebuilding, because the
# ticket is stapled to the artifact you already have.
#
# Credentials come from a notarytool keychain profile (APPLE_KEYCHAIN_PROFILE,
# default AC_PASSWORD), created once with:
#   xcrun notarytool store-credentials AC_PASSWORD \
#     --apple-id <email> --team-id <TEAMID> --password <app-specific-password>
# ============================================================================

set -euo pipefail

PROFILE="${APPLE_KEYCHAIN_PROFILE:-AC_PASSWORD}"
STATE="${NOTARIZE_STATE:-dist/.notarize-state.json}"

die() {
  echo "notarize: $*" >&2
  exit 1
}

require_tools() {
  command -v xcrun >/dev/null || die "xcrun not found (install Xcode Command Line Tools)"
  command -v python3 >/dev/null || die "python3 not found"
  xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 ||
    die "keychain profile '$PROFILE' does not authenticate. Create it with:
  xcrun notarytool store-credentials $PROFILE --apple-id <email> --team-id <TEAMID> --password <app-specific-password>"
}

# State is a JSON object: { "<artifact basename>": {id, path, submitted} }
state_py() {
  python3 - "$STATE" "$@"
}

usage() {
  cat <<'EOF'
Usage:
  notarize.sh submit <artifact>...   Upload artifacts, record submission ids, return
  notarize.sh status                 Print Apple's status for every recorded submission
  notarize.sh staple                 Staple + validate every Accepted artifact
  notarize.sh log <artifact>         Fetch Apple's detailed log for one artifact
  notarize.sh reset                  Forget recorded submissions (does not cancel them)

Env:
  APPLE_KEYCHAIN_PROFILE  notarytool profile name (default: AC_PASSWORD)
  NOTARIZE_STATE          state file path (default: dist/.notarize-state.json)
EOF
}

cmd_submit() {
  [ $# -gt 0 ] || die "submit needs at least one artifact"
  require_tools
  mkdir -p "$(dirname "$STATE")"
  [ -f "$STATE" ] || echo '{}' >"$STATE"

  for artifact in "$@"; do
    [ -f "$artifact" ] || die "no such file: $artifact"
    local name
    name="$(basename "$artifact")"

    echo "notarize: uploading $name ..."
    # No --wait: we want the id, not a blocked terminal.
    local out id
    out="$(xcrun notarytool submit "$artifact" --keychain-profile "$PROFILE" --output-format json)"
    id="$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

    state_py "$name" "$id" "$artifact" <<'PY'
import json, sys, datetime
state_path, name, sid, path = sys.argv[1:5]
try:
    with open(state_path) as fh:
        data = json.load(fh)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}
data[name] = {"id": sid, "path": path, "submitted": datetime.datetime.now().isoformat(timespec="seconds")}
with open(state_path, "w") as fh:
    json.dump(data, fh, indent=2)
PY
    echo "notarize: $name submitted as $id"
  done

  echo ""
  echo "notarize: submissions recorded in $STATE"
  echo "notarize: run './notarize.sh status' whenever you like — minutes or days from now."
}

# Prints "<name> <status>" per line and returns 1 if anything is still In Progress.
collect_status() {
  local pending=0
  while read -r name id; do
    [ -n "$name" ] || continue
    local status
    status="$(xcrun notarytool info "$id" --keychain-profile "$PROFILE" --output-format json 2>/dev/null |
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","Unknown"))' 2>/dev/null || echo "Unknown")"
    printf '  %-56s %s\n' "$name" "$status"
    [ "$status" = "In Progress" ] && pending=1
  done < <(state_py <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}
for name, entry in data.items():
    print(name, entry["id"])
PY
)
  return $pending
}

cmd_status() {
  require_tools
  [ -f "$STATE" ] || die "no submissions recorded in $STATE"
  echo "notarize: submission status"
  collect_status || {
    echo ""
    echo "notarize: still in progress. Apple can take minutes or over a day; nothing is lost by waiting."
    return 0
  }
}

cmd_staple() {
  require_tools
  [ -f "$STATE" ] || die "no submissions recorded in $STATE"

  local stapled=0 skipped=0
  while read -r name id path; do
    [ -n "$name" ] || continue
    local status
    status="$(xcrun notarytool info "$id" --keychain-profile "$PROFILE" --output-format json 2>/dev/null |
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","Unknown"))')"

    if [ "$status" != "Accepted" ]; then
      echo "notarize: skipping $name (status: $status)"
      skipped=$((skipped + 1))
      continue
    fi
    [ -f "$path" ] || die "$name was Accepted but $path is gone — rebuild would need re-notarizing"

    xcrun stapler staple "$path"
    # Fail loudly rather than ship an artifact whose ticket did not attach.
    xcrun stapler validate "$path"
    echo "notarize: $name stapled and validated"
    stapled=$((stapled + 1))
  done < <(state_py <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}
for name, entry in data.items():
    print(name, entry["id"], entry["path"])
PY
)

  echo "notarize: $stapled stapled, $skipped skipped"
  [ "$skipped" -eq 0 ] || echo "notarize: re-run './notarize.sh staple' once the rest are Accepted"
}

cmd_log() {
  [ $# -eq 1 ] || die "log needs exactly one artifact name"
  require_tools
  local id
  id="$(state_py "$1" <<'PY'
import json, sys
state_path, name = sys.argv[1:3]
with open(state_path) as fh:
    data = json.load(fh)
entry = data.get(name) or data.get(__import__("os").path.basename(name))
print(entry["id"] if entry else "")
PY
)"
  [ -n "$id" ] || die "no recorded submission for $1"
  xcrun notarytool log "$id" --keychain-profile "$PROFILE"
}

case "${1:-}" in
  submit)
    shift
    cmd_submit "$@"
    ;;
  status)
    cmd_status
    ;;
  staple)
    cmd_staple
    ;;
  log)
    shift
    cmd_log "$@"
    ;;
  reset)
    rm -f "$STATE"
    echo "notarize: cleared $STATE"
    ;;
  *)
    usage
    exit 1
    ;;
esac
