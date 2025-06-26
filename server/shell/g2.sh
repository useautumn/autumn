#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

MOCHA_PARALLEL=true $MOCHA_SETUP && $MOCHA_CMD \
'tests/attach/others/*.ts' 
# 'tests/attach/migrations/*.ts' \
# 'tests/attach/newVersion/*.ts' \
# 'tests/attach/upgradeOld/*.ts' \
# 'tests/attach/entities/*.ts' \
# 'tests/attach/updateEnts/*.ts'


