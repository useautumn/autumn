#!/bin/bash

# Test Group 1: Upgrade & Downgrade Tests
# Description: Tests for product upgrades and downgrades

# Source shared configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  $BUN_SETUP
fi

# Run tests using TypeScript runner with compact mode
# Adjust --max to control concurrency (default: 6)
$BUN_PARALLEL_COMPACT \
  'tests/check/basic' \
  'tests/balances/track' \
  'tests/attach/basic' \
  'tests/attach/upgrade' \
  'tests/attach/downgrade' \
  'tests/attach/free' \
  'tests/attach/addOn' \
  'tests/attach/entities' \
  'tests/attach/checkout'