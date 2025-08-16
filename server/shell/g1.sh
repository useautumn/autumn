#!/bin/bash

# Source shared configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# If contains setup then run $MOCHA_SETUP
if [[ "$1" == *"setup"* ]]; then
  MOCHA_PARALLEL=true $MOCHA_SETUP
fi

$MOCHA_CMD \
'tests/attach/basic/*.ts' \
'tests/attach/upgrade/*.ts' \
'tests/attach/downgrade/*.ts' \
'tests/attach/addOn/*.ts'

$MOCHA_CMD \
'tests/attach/checkout/*.ts' \
'tests/attach/entities/*.ts' \
'tests/attach/free/*.ts'\

# 'tests/attach/basic/basic2.ts' \