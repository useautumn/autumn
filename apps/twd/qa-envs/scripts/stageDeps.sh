#!/usr/bin/env bash
# Stages the dependency manifests of a ref into container/deps so the base image bakes node_modules.
# Usage: stageDeps.sh [ref]  (defaults to HEAD of this checkout)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
REF=${1:-HEAD}
OUT="$HERE/container/deps"
rm -rf "$OUT" && mkdir -p "$OUT"
git -C "$REPO" archive "$REF" -- bun.lock bunfig.toml patches $(git -C "$REPO" ls-tree -r --name-only "$REF" | grep -E '(^|/)package\.json$') | tar -x -C "$OUT"
# preload-env.ts isn't in the deps context; installs don't need it.
sed -i '/^preload = /d' "$OUT/bunfig.toml"
git -C "$REPO" rev-parse "$REF" > "$OUT/.deps-sha"
echo "staged $(find "$OUT" -name package.json | wc -l) manifests at $(cat "$OUT/.deps-sha")"
