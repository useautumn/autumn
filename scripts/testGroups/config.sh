#!/bin/bash

# Shared configuration for test groups

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"

# Find bun executable (check common locations)
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

# Test runner function
BUN_PARALLEL() {
  cd "$PROJECT_ROOT" && $BUN_CMD scripts/testScripts/runTests.ts "$@"
}

# Test runner with compact mode (recommended for many tests)
BUN_PARALLEL_COMPACT() {
  cd "$PROJECT_ROOT" && $BUN_CMD scripts/testScripts/runTests.ts "$@" --compact
}

# Setup function
BUN_SETUP() {
  cd "$SERVER_DIR" && $BUN_CMD tests/setupMain.ts
}

# Mocha function (for tests not yet migrated)
MOCHA_CMD() {
  cd "$SERVER_DIR" && npx mocha --parallel -j 6 --timeout 10000000 --ignore tests/00_setup.ts "$@"
}

