#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"



BUN_PARALLEL_COMPACT \
  'server/tests/advanced/coupons' \
  'server/tests/advanced/referrals' \
  # 'server/tests/advanced/rollovers' \
  # 'server/tests/advanced/misc' \
  # 'server/tests/attach/updateQuantity' \
  # 'server/tests/attach/multiProduct' \
  # 'server/tests/advanced/multiFeature' \
  # 'server/tests/advanced/customInterval' \
  # 'server/tests/advanced/usageLimit' \
  # --max=6


# BUN_PARALLEL_COMPACT \
#   'server/tests/advanced/usage'
#   # 'server/tests/crud/plan'

# # 'server/tests/advanced/referrals/paid' \