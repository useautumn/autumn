#!/bin/bash

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/.."
PROJECT_ROOT="$SERVER_DIR/.."

# Find bun executable
if command -v bun &> /dev/null; then
  BUN_CMD="bun"
elif [ -f "$HOME/.bun/bin/bun" ]; then
  BUN_CMD="$HOME/.bun/bin/bun"
elif [ -f "/usr/local/bin/bun" ]; then
  BUN_CMD="/usr/local/bin/bun"
else
  echo "Error: bun not found. Please install bun or add it to PATH."
  exit 1
fi

# Setup function
BUN_SETUP="$BUN_CMD tests/setupMain.ts"

# Test runner functions (using new TypeScript runner)
BUN_PARALLEL() {
  cd "$PROJECT_ROOT" && $BUN_CMD server/tests/testRunner/runTests.ts "$@"
}

BUN_PARALLEL_COMPACT() {
  cd "$PROJECT_ROOT" && $BUN_CMD server/tests/testRunner/runTests.ts "$@" --compact
}

# Mocha command (for tests not yet migrated)
MOCHA_CMD="npx mocha --parallel -j 6 --timeout 10000000 --ignore tests/00_setup.ts"