#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_COMPACT \
  'server/tests/contUse/roles' \
  'server/tests/contUse/update' \
  'server/tests/contUse/entities' \
  'server/tests/balances/set-usage' \
  --max=6

  # 'server/tests/contUse/track' \
