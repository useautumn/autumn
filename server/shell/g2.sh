#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# If contains setup then run $MOCHA_SETUP
if [[ "$1" == *"setup"* ]]; then
  MOCHA_PARALLEL=true $MOCHA_SETUP
fi

$MOCHA_CMD \
'tests/attach/migrations/*.ts' \
'tests/attach/newVersion/*.ts' \
'tests/attach/upgradeOld/*.ts' \
'tests/attach/others/*.ts' \
'tests/attach/updateEnts/*.ts' \
'tests/advanced/check/*.ts' \
'tests/attach/others/*.ts'
# 'tests/attach/entities/*.ts' \

$MOCHA_CMD 'tests/attach/prepaid/*.ts' \
'tests/interval/upgrade/*.ts' \
'tests/interval/multiSub/*.ts'
