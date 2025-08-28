#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# MOCHA_PARALLEL=true $MOCHA_SETUP 
if [[ "$1" == *"setup"* ]]; then
  MOCHA_PARALLEL=true $MOCHA_SETUP
fi




# $MOCHA_CMD 'tests/merged/add/*.ts' \
# 'tests/merged/downgrade/*.ts' \
# 'tests/merged/prepaid/*.ts' \
# 'tests/merged/separate/*.ts' \
# 'tests/merged/upgrade/*.ts' \
# 'tests/merged/trial/*.ts'


$MOCHA_CMD 'tests/merged/addOn/*.ts' \
'tests/core/cancel/*.ts' \
'tests/core/multiAttach/*.ts' \
'tests/core/multiAttach/multiInvoice/*.ts' \
'tests/core/multiAttach/multiUpgrade/*.ts'

# $MOCHA_CMD 'tests/core/multiAttach/multiReward/multiReward1.test.ts'
# $MOCHA_CMD 'tests/core/multiAttach/multiReward/multiReward2.test.ts'
# $MOCHA_CMD 'tests/core/multiAttach/multiReward/multiReward3.test.ts'
