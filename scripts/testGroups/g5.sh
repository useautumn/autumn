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

# Note: advanced/multiFeature, advanced/rollovers, advanced/customInterval,
# advanced/usageLimit still use Mocha (not migrated yet)

BUN_PARALLEL_COMPACT \
  'server/tests/advanced/coupons' \
  'server/tests/attach/updateQuantity' \
  'server/tests/advanced/referrals' \
  'server/tests/advanced/referrals/paid' \
  'server/tests/attach/multiProduct' \
  'server/tests/advanced/usage' \
  --max=6

