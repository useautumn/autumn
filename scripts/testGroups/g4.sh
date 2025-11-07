#!/bin/bash

# Test Group 4: Merged & Core Tests  
# Description: Tests for merged subscriptions and core functionality

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

BUN_PARALLEL_COMPACT \
  'server/tests/merged/group' \
  'server/tests/merged/add' \
  'server/tests/merged/downgrade' \
  'server/tests/merged/prepaid' \
  'server/tests/merged/separate' \
  'server/tests/merged/upgrade' \
  'server/tests/merged/trial' \
  'server/tests/merged/addOn' \
  'server/tests/core/cancel' \
  'server/tests/core/multiAttach' \
  'server/tests/core/multiAttach/multiInvoice' \
  'server/tests/core/multiAttach/multiUpgrade' \
  --max=6

