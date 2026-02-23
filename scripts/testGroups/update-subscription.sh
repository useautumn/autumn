#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e


# export USE_KERNEL_BROWSER=1
export TEST_FILE_CONCURRENCY=2

BUN_PARALLEL_V2 \
  'update-subscription/invoice' \
  # 'update-subscription/invoice' \
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

