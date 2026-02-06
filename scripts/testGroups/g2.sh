# Core attach tests

source "$(dirname "$0")/config.sh"

export TEST_FILE_CONCURRENCY=6

BUN_PARALLEL_V2 \
  'attach/basic' \
  'attach/migrations' \
  'attach/upgrade' \
  'attach/downgrade' \
  'attach/free' \
  'attach/addOn' \
  'attach/checkout' \
  'attach/others' \
  'attach/upgradeOld' \
  'attach/response' \
  'interval/upgrade' \
  'interval/multiSub' \
  'billing/new-billing-subscription' \
  'billing/invoice-action-required' \
  'billing/legacy/attach' \
  --max=6

# From attach/migrations is new stuff...

BUN_PARALLEL_V2 \
  'server/tests/attach/entities' 


# 'attach/updateEnts' \
# 'attach/newVersion' \