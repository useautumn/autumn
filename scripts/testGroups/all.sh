#!/bin/bash
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_V2 \
  'integration/billing/update-subscription' \
  # 'integration/billing/stripe-webhooks' \
  # 'integration/crud/customers' \


# 'integration/billing/attach' \
# 'integration/cron/one-off-cleanup' \