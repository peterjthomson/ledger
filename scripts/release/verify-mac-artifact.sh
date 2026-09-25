#!/usr/bin/env bash
# Shared with Marktext and Year View; ZIP-only and DMG releases use the same gate.
set -euo pipefail
exec python3 "$(dirname "$0")/mac_artifacts.py" "$@"
