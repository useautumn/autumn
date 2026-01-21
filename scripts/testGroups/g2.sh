# Core attach tests

source "$(dirname "$0")/config.sh"



# BUN_PARALLEL_V2 \
#   'server/tests/attach/basic' \
#   'server/tests/attach/upgrade' \
#   'server/tests/attach/downgrade' \
#   'server/tests/attach/free' \
#   'server/tests/attach/addOn' \
#   'server/tests/attach/checkout' \
#   'server/tests/attach/misc' \
#   'server/tests/integration/billing/invoice-action-required' \
#   'server/tests/integration/billing/cancel' \
#   'server/tests/integration/billing/cancel/add-ons' \
#   --max=6

BUN_PARALLEL_V2 \
  'server/tests/attach/entities' \
  --max=6
  # 'server/tests/external-psps/revenuecat' \
