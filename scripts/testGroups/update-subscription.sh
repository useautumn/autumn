#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e

# bun test:integration update-subscription/custom-plan
# bun test:integration update-subscription/discounts
# bun test:integration update-subscription/errors
bun test:integration update-subscription/free-trial
bun test:integration update-subscription/invoice
bun test:integration update-subscription/multi-product
bun test:integration update-subscription/preview-total
bun test:integration update-subscription/update-quantity
bun test:integration update-subscription/version-update


# Adjust --max to control concurrency (default: 6)
# BUN_PARALLEL_COMPACT \
#   'server/tests/billing/update-subscription/custom-plan' \
#   --max=6
  
