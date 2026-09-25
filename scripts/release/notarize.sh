#!/usr/bin/env bash
# Shared with Marktext and Year View. Submission returns without waiting on Apple.
set -euo pipefail
exec python3 "$(dirname "$0")/notarize.py" "$@"
