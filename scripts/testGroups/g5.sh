#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_COMPACT \
  'server/tests/merged/downgrade' \
  'server/tests/merged/separate' \
  'server/tests/merged/add' \
  'server/tests/merged/group' \
  'server/tests/merged/prepaid' \
  'server/tests/merged/upgrade' \
  'server/tests/merged/addOn' \
  'server/tests/merged/trial' \
  'server/tests/core/cancel' \
  --max=6 \
  
  
  



# deprecated tests(?)
# 'server/tests/core/multiAttach' \
# 'server/tests/core/multiAttach/multiInvoice' \
# 'server/tests/core/multiAttach/multiUpgrade' \
# 'sever/tests/core/multiAttach/multiReward'
