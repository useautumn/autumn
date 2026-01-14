#!/bin/bash

# Test Group 1: Upgrade & Downgrade Tests
# Description: Tests for product upgrades and downgrades

# Source shared configuration
source "$(dirname "$0")/config.sh"


# Run tests using TypeScript runner with compact mode
# Adjust --max to control concurren.cy (default: 6)
BUN_PARALLEL_COMPACT \
  'server/tests/balances/track/basic' \
  'server/tests/balances/track/concurrency' \
  'server/tests/balances/track/breakdown' \
  'server/tests/balances/track/credit-systems' \
  'server/tests/balances/track/entity-products' \
  'server/tests/balances/track/legacy' \
  'server/tests/balances/track/allocated' \
  'server/tests/balances/track/entity-balances' \
  'server/tests/balances/track/negative' \
  'server/tests/balances/track/rollovers' \
  'server/tests/balances/track/race-condition' \
  'server/tests/balances/track/paid-allocated' \
  'server/tests/balances/track/edge-cases' \
  'server/tests/balances/check/breakdown' \
  'server/tests/balances/track/loose' \
  'server/tests/balances/check/basic' \
  'server/tests/balances/check/credit-systems' \
  'server/tests/balances/check/misc' \
  'server/tests/balances/check/prepaid' \
  'server/tests/balances/check/send-event' \
  'server/tests/balances/check/loose' \
  --max=6


BUN_PARALLEL_COMPACT \
  'server/tests/balances/update/filters' \
  'server/tests/balances/update/update-combined' \
  'server/tests/balances/update/update-current-balance/basic' \
  'server/tests/balances/update/update-current-balance/entity' \
  'server/tests/balances/update/update-current-balance/allocated' \
  'server/tests/balances/update/update-current-balance/breakdown' \
  'server/tests/balances/update/update-granted-balance' \
  --max=6