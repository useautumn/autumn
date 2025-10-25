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

# These tests still use Mocha - will be migrated later

MOCHA_CMD 'tests/merged/group/*.ts'

MOCHA_CMD 'tests/merged/add/*.ts' \
'tests/merged/downgrade/*.ts' \
'tests/merged/prepaid/*.ts' \
'tests/merged/separate/*.ts' \
'tests/merged/upgrade/*.ts' \
'tests/merged/trial/*.ts'

MOCHA_CMD 'tests/merged/addOn/*.ts' \
'tests/core/cancel/*.ts' \
'tests/core/multiAttach/*.ts' \
'tests/core/multiAttach/multiInvoice/*.ts' \
'tests/core/multiAttach/multiUpgrade/*.ts'

