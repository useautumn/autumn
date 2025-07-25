#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# MOCHA_PARALLEL=true $MOCHA_SETUP

if [[ "$1" == *"setup"* ]]; then
  MOCHA_PARALLEL=true $MOCHA_SETUP
fi

$MOCHA_CMD 'tests/contUse/entities/*.ts'

$MOCHA_CMD 'tests/contUse/update/*.ts'

$MOCHA_CMD 'tests/contUse/track/*.ts'

$MOCHA_CMD 'tests/contUse/roles/*.ts' 