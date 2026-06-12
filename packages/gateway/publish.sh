#!/bin/bash
set -e

# bun publish (not npm) — it resolves the catalog: devDependency when packing.

bun run build
bun test tests/unit

if [ "$1" = "--tag" ] && [ "$2" = "beta" ]; then
  bun publish --access public --tag beta
elif [ "$1" = "--major" ]; then
  npm version major --no-git-tag-version
  bun publish --access public
elif [ "$1" = "--minor" ]; then
  npm version minor --no-git-tag-version
  bun publish --access public
elif [ "$1" = "--patch" ]; then
  npm version patch --no-git-tag-version
  bun publish --access public
else
  # First release / publish current package.json version as-is
  bun publish --access public
fi
