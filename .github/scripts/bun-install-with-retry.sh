#!/usr/bin/env bash
set -euo pipefail

if bun install --frozen-lockfile; then
	exit 0
fi

echo "bun install failed; retrying with a clean cache"
rm -rf "${HOME}/.bun/install/cache"
bun install --frozen-lockfile --cache-dir="$(mktemp -d)"
