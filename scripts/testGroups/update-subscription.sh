#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e



BUN_PARALLEL_V2 \
  'update-subscription/invoice' \
  # 'update-subscription/custom-plan' \
  # 'update-subscription/discounts' \
  # 'update-subscription/errors' \
  # 'update-subscription/free-trial' \
  # 'update-subscription/multi-product' \
  # 'update-subscription/update-quantity' \
  # 'update-subscription/version-update' \
  # 'update-subscription/cancel/uncancel' \
  # 'update-subscription/cancel/immediately' \
  # 'update-subscription/cancel/end-of-cycle' \
  # --max=3

