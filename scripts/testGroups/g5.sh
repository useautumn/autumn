#!/bin/bash

# Test Group 5: Advanced Features
# Description: Tests for advanced features like coupons, referrals, usage limits

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

# These tests still use Mocha - will be migrated later

MOCHA_CMD 'tests/advanced/multiFeature/*.ts' \
           'tests/advanced/coupons/*.ts' \
           'tests/attach/updateQuantity/*.ts' \
           'tests/advanced/referrals/*.ts' \
           'tests/advanced/referrals/paid/*.ts' \
           'tests/advanced/rollovers/*.ts' \
           'tests/advanced/customInterval/*.ts'
          
MOCHA_CMD 'tests/attach/multiProduct/*.ts' \
           'tests/advanced/usageLimit/*.ts'

MOCHA_CMD 'tests/advanced/usage/*.ts'

