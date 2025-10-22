#!/bin/bash

# Source shared configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# If contains setup then run $MOCHA_SETUP
if [[ "$1" == *"setup"* ]]; then
  MOCHA_PARALLEL=true $BUN_SETUP
fi

# Run parallel basic tests
$BUN_PARALLEL tests/attach/basic
$BUN_PARALLEL tests/check/basic

# # TODO: Refactor these tests to use Bun
# $MOCHA_CMD 'tests/attach/upgrade/*.ts' 'tests/attach/downgrade/*.ts'

# $MOCHA_CMD \
# 'tests/attach/checkout/*.ts' \
# 'tests/attach/entities/*.ts' \
# 'tests/attach/free/*.ts'\
# 'tests/attach/addOn/*.ts'