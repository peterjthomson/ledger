#!/usr/bin/env bash
# Verify Ledger direct-download artifacts, including ZIP-only releases.
set -euo pipefail
exec python3 "$(dirname "$0")/mac_artifacts.py" "$@"
