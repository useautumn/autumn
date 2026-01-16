#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_COMPACT \
  'server/tests/contUse/update' \
  --max=6

  # 'server/tests/contUse/track' \
