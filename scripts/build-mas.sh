#!/usr/bin/env bash

set -euo pipefail

readonly expected_app_id="R4RRG93J68.com.peterjthomson.ledger"
readonly profile_dir="${LEDGER_MAS_PROFILE_DIR:-$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles}"
profile_path="${LEDGER_MAS_PROVISIONING_PROFILE:-}"

if [[ -z "$profile_path" ]]; then
  profile_plist="$(mktemp /tmp/ledger-mas-profile.XXXXXX)"
  trap 'rm -f "$profile_plist"' EXIT

  for candidate in "$profile_dir"/*.provisionprofile; do
    [[ -f "$candidate" ]] || continue
    if ! security cms -D -i "$candidate" -o "$profile_plist" 2>/dev/null; then
      continue
    fi

    candidate_app_id="$(
      /usr/libexec/PlistBuddy \
        -c 'Print :Entitlements:com.apple.application-identifier' \
        "$profile_plist" 2>/dev/null || true
    )"
    if [[ "$candidate_app_id" == "$expected_app_id" ]]; then
      profile_path="$candidate"
      break
    fi
  done
fi

if [[ -z "$profile_path" || ! -f "$profile_path" ]]; then
  echo "No Mac App Store provisioning profile found for $expected_app_id." >&2
  echo "Install one in \"$profile_dir\" or set LEDGER_MAS_PROVISIONING_PROFILE." >&2
  exit 1
fi

echo "Using Mac App Store provisioning profile: $profile_path"
exec npx --no-install electron-builder \
  --mac mas \
  --arm64 \
  -c.mas.provisioningProfile="$profile_path"
