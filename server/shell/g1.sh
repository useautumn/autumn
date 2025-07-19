#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

MOCHA_PARALLEL=true $MOCHA_SETUP \
&& $MOCHA_CMD \
'tests/attach/basic/*.ts' \
'tests/attach/upgrade/*.ts' \
'tests/attach/downgrade/*.ts'

# 'tests/attach/basic/basic2.ts' \