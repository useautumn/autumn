#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# If contains setup then run $MOCHA_SETUP
  MOCHA_PARALLEL=true $MOCHA_SETUP
# if [[ "$2" == *"setup"* ]]; then
# fi

$MOCHA_CMD \
'tests/attach/basic/*.ts' \
'tests/attach/upgrade/*.ts' \
'tests/attach/downgrade/*.ts' \
'tests/attach/checkout/*.ts'

$MOCHA_CMD \
'tests/attach/entities/*.ts' \
'tests/attach/free/*.ts'

# 'tests/attach/basic/basic2.ts' \