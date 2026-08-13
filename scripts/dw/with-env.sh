#!/usr/bin/env bash
# bun dw entry. Named with-env.sh because a bare `run.sh` is gitignored.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/scripts/setup/cursor-cloud/with-infisical.sh" -- bun scripts/dw/index.ts "$@"
