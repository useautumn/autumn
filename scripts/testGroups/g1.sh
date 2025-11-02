#!/bin/bash

# Test Group 1: Upgrade & Downgrade Tests
# Description: Tests for product upgrades and downgrades

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

# Run tests using TypeScript runner with compact mode
# Adjust --max to control concurrency (default: 6)
BUN_PARALLEL_COMPACT \
  'server/tests/balances/check' \
  'server/tests/balances/track' \
  'server/tests/attach/basic' \
  'server/tests/attach/upgrade' \
  'server/tests/attach/downgrade' \
  'server/tests/attach/free' \
  'server/tests/attach/addOn' \
  'server/tests/attach/entities' \
  'server/tests/attach/checkout' \
  --max=6 \



