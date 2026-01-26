#!/bin/bash
source "$(dirname "$0")/config.sh"

export TEST_FILE_CONCURRENCY=6

BUN_PARALLEL_V2 \
  'merged/downgrade' \
  'merged/separate' \
  'merged/add' \
  'merged/group' \
  'merged/prepaid' \
  'merged/upgrade' \
  'merged/addOn' \
  'merged/trial' \
  


# deprecated tests(?)
# 'server/tests/core/multiAttach' \
# 'server/tests/core/multiAttach/multiInvoice' \
# 'server/tests/core/multiAttach/multiUpgrade' \
# 'sever/tests/core/multiAttach/multiReward'
