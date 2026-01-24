#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e

# bun test:integration create-customer
# bun test:integration update-subscription/custom-plan
# bun test:integration update-subscription/discounts
# bun test:integration update-subscription/errors
# bun test:integration update-subscription/free-trial
# bun test:integration update-subscription/invoice
# bun test:integration update-subscription/multi-product
# bun test:integration update-subscription/update-quantity
# bun test:integration update-subscription/version-update



BUN_PARALLEL_V2 \
  'update-subscription/custom-plan' \
  'update-subscription/discounts' \
  'update-subscription/errors' \
  'update-subscription/free-trial' \
  'update-subscription/invoice' \
  'update-subscription/multi-product' \
  'update-subscription/update-quantity' \
  'update-subscription/version-update' \
  'update-subscription/cancel/uncancel' \
  'update-subscription/cancel/immediately' \
  'update-subscription/cancel/end-of-cycle' \
  --max=2

