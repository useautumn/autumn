#!/bin/bash

# Test Group 1: Upgrade & Downgrade Tests
# Description: Tests for product upgrades and downgrades

# Source shared configuration
source "$(dirname "$0")/config.sh"


# Run tests using TypeScript runner with compact mode
# Adjust --max to control concurren.cy (default: 6)

export TEST_FILE_CONCURRENCY=6

BUN_PARALLEL_V2 \
  'integration/balances/check' \
  'integration/balances/track' \
  'balances/track/basic' \
  'balances/track/concurrency' \
  'balances/track/breakdown' \
  'balances/track/credit-systems' \
  'balances/track/entity-products' \
  'balances/track/legacy' \
  'balances/track/allocated' \
  'balances/track/entity-balances' \
  'balances/track/negative' \
  'balances/track/rollovers' \
  'balances/track/race-condition' \
  'balances/track/paid-allocated' \
  'balances/track/edge-cases' \
  'balances/check/breakdown' \
  'balances/track/loose' \
  'balances/check/credit-systems' \
  'balances/check/misc' \
  'balances/check/prepaid' \
  'balances/check/send-event' \
  'balances/check/loose' \
  'balances/set-usage' \
  --max=6


BUN_PARALLEL_V2 \
  'server/tests/balances/update/filters' \
  'server/tests/balances/update/update-combined' \
  'server/tests/balances/update/update-current-balance/basic' \
  'server/tests/balances/update/update-current-balance/entity' \
  'server/tests/balances/update/update-current-balance/allocated' \
  'server/tests/balances/update/update-current-balance/breakdown' \
  'server/tests/balances/update/update-granted-balance' \
  --max=6
