#!/bin/bash

# Test Group 6: Alex Tests
# Description: Integration tests for Alex scenarios

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

# These tests still use Mocha - will be migrated later
cd "$SERVER_DIR"

npx mocha --parallel --timeout 10000000 \
    'tests/alex/01_free.ts' 'tests/alex/02_pro.ts' 'tests/alex/03_premium.ts' \
    'tests/alex/04_topups.ts' 'tests/alex/05_cancel.ts' 'tests/alex/06_switch.ts' \
    --ignore 'tests/alex/00_setup.ts'

