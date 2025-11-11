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

# These tests still use Mocha - will be migrated later

# MOCHA_CMD 'tests/contUse/entities/*.ts'
# MOCHA_CMD 'tests/contUse/update/*.ts'
MOCHA_CMD 'tests/contUse/track/*.ts'
# MOCHA_CMD 'tests/contUse/roles/*.ts'

