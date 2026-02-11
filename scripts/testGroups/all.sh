#!/bin/bash
source "$(dirname "$0")/config.sh"

export TEST_FILE_CONCURRENCY=2

BUN_PARALLEL_V2 \
  'integration/billing/update-subscription' \
  'integration/billing/migrations' \
  # 'integration/billing/stripe-webhooks' \
  # 'integration/billing/autumn-webhooks' \
  # 'integration/billing/cron' \
  # 'integration/billing/attach' \
  # 'integration/crud/customers' \
  # 'integration/crud/plans' \


# 'integration/billing/attach' \
# 'integration/cron/one-off-cleanup' \