#!/bin/bash

# Shared configuration for test groups

export TEST_FILE_CONCURRENCY=${TEST_FILE_CONCURRENCY:-3}

# Get project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
BUN_CMD="infisical run --env=dev -- bun"

# Test runner function
BUN_PARALLEL() {
  cd "$PROJECT_ROOT" && $BUN_CMD scripts/testScripts/runTests.ts "$@"
}

# Test runner with compact mode (recommended for many tests)
BUN_PARALLEL_COMPACT() {
  cd "$PROJECT_ROOT" && $BUN_CMD scripts/testScripts/runTests.ts "$@" --compact
}

# V2 test runner - shows individual tests, better error display (Ink-based)
BUN_PARALLEL_V2() {
  cd "$PROJECT_ROOT" && $BUN_CMD scripts/testScripts/runTestsV2.tsx "$@" --max="$TEST_FILE_CONCURRENCY"
}

# Setup function
BUN_SETUP() {
  cd "$SERVER_DIR" && $BUN_CMD tests/setupMain.ts
}

