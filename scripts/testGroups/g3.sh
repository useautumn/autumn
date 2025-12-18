#!/bin/bash

# Test Group 3: Migrations, Versions & Others
# Description: Tests for migrations, version updates, and miscellaneous features

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi



BUN_PARALLEL_COMPACT \
  'server/tests/attach/migrations' \
  'server/tests/attach/others' \
  'server/tests/attach/newVersion' \
  'server/tests/attach/upgradeOld' \
  'server/tests/attach/updateEnts' \
  'server/tests/attach/prepaid' \
  'server/tests/attach/response' \
  'server/tests/interval/upgrade' \
  'server/tests/interval/multiSub' \
  'server/tests/billing/cancel' \
  'server/tests/billing/new-billing-subscription' \
  'server/tests/billing/invoice-action-required/new-subscription' \
  --max=6

