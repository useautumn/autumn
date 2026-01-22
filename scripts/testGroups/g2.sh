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
#   'billing/invoice-action-required' \
#   'billing/cancel' \
#   'billing/cancel/add-ons' \
#   'billing/legacy/attach' \
#   --max=6

BUN_PARALLEL_V2 \
  'server/tests/attach/entities' \
  --max=6
  # 'server/tests/external-psps/revenuecat' \
