#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_V2 \
  'stripe-webhooks/subscription-deleted'\
  'stripe-webhooks/invoice-created' \
  'stripe-webhooks/subscription-updated' \
  --max=3
