#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_V2 \
  'stripe-webhooks/invoice-created' \
  'stripe-webhooks/subscription-deleted'
  --max=3
