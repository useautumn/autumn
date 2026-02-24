#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e



BUN_PARALLEL_V2 \
  'integration/crud/customers' \
  'integration/billing/autumn-webhooks' \
  'integration/cron' \
  'integration/crud/plans' \
  # 'integration/billing/stripe-webhooks' \
  # 'integration/billing/migrations' \


