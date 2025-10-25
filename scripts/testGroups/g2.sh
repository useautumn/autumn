#!/bin/bash

# Test Group 2: Migrations, Versions & Others
# Description: Tests for migrations, version updates, and miscellaneous features

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Setup if requested
if [[ "$1" == *"setup"* ]]; then
  echo "Running test setup..."
  BUN_SETUP
fi

# These tests still use Mocha - will be migrated later

MOCHA_CMD \
'tests/attach/migrations/*.ts' \
'tests/attach/newVersion/*.ts' \
'tests/attach/upgradeOld/*.ts' \
'tests/attach/others/*.ts' \
'tests/attach/updateEnts/*.ts' \
'tests/advanced/check/*.ts'

MOCHA_CMD 'tests/attach/prepaid/*.ts' \
'tests/interval/upgrade/*.ts' \
'tests/interval/multiSub/*.ts'

