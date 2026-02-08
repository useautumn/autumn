#!/bin/bash
source "$(dirname "$0")/config.sh"

export TEST_FILE_CONCURRENCY=2

BUN_PARALLEL_V2 \
  'integration/billing/update-subscription' \
  'integration/billing/stripe-webhooks' \
  'integration/billing/autumn-webhooks' \
  'integration/billing/migrations' \
  'integration/billing/cron' \
  'integration/crud/customers' \
  'integration/billing/attach' \


# 'integration/billing/attach' \
# 'integration/cron/one-off-cleanup' \