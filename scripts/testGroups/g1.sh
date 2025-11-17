#!/bin/bash

# Test Group 1: Upgrade & Downgrade Tests
# Description: Tests for product upgrades and downgrades

# Source shared configuration
source "$(dirname "$0")/config.sh"


# Run tests using TypeScript runner with compact mode
# Adjust --max to control concurrency (default: 6)
# BUN_PARALLEL_COMPACT \
#   'server/tests/balances/check/basic' \
#   'server/tests/balances/check/credit-systems' \
#   'server/tests/balances/check/misc' \
#   'server/tests/balances/check/prepaid' \
#   'server/tests/balances/track/basic' \
#   'server/tests/balances/track/credit-systems' \
#   'server/tests/balances/track/entity-products' \
#   'server/tests/balances/track/legacy' \
#   'server/tests/balances/track/allocated' \
#   'server/tests/balances/track/entity-balances' \
#   'server/tests/balances/track/concurrency' \


