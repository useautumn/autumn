# Core attach tests

source "$(dirname "$0")/config.sh"

export TEST_FILE_CONCURRENCY=6

  # 'attach/migrations' \
BUN_PARALLEL_V2 \
  'attach/basic' \
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
  # 'billing/new-billing-subscription' \
  # 'billing/legacy/attach' \
  # 'server/tests/attach/entities' 
  # --max=6


  # 'billing/invoice-action-required' \