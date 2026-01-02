# Core attach tests

source "$(dirname "$0")/config.sh"

BUN_PARALLEL_COMPACT \
  'server/tests/attach/basic' \
  'server/tests/attach/upgrade' \
  'server/tests/attach/downgrade' \
  'server/tests/attach/free' \
  'server/tests/attach/addOn' \
  'server/tests/attach/checkout' \
  'server/tests/attach/misc' \
  'server/tests/billing/invoice-action-required' \
  'server/tests/billing/cancel' \
  'server/tests/billing/cancel/add-ons' \
  'server/tests/renew' \
  --max=6

BUN_PARALLEL_COMPACT \
  'server/tests/attach/entities' \
  --max=6
  # 'server/tests/external-psps/revenuecat' \
