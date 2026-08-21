#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CAPY_TRIGGER_IMAGE_TAG="$(cd "$REPO_ROOT" && bun -e 'const p = require("./package.json"); console.log(`v${p.devDependencies?.["trigger.dev"] ?? p.dependencies?.["trigger.dev"] ?? ""}`)')"
if [ -z "$CAPY_TRIGGER_IMAGE_TAG" ] || [ "$CAPY_TRIGGER_IMAGE_TAG" = "v" ]; then
  echo "[capy-trigger-image] ERROR: unable to derive trigger.dev tag from package.json" >&2
  exit 1
fi
export CAPY_TRIGGER_IMAGE_TAG
export TRIGGER_IMAGE_TAG="$CAPY_TRIGGER_IMAGE_TAG"
