#!/bin/bash

# Test Group 3: Continuous Use Tests
# Description: Tests for continuous usage tracking, entities, and roles

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

BUN_PARALLEL_COMPACT \
  'server/tests/contUse/track' \
  'server/tests/contUse/roles' \
  'server/tests/contUse/update' \
  'server/tests/contUse/entities' \
  --max=6

