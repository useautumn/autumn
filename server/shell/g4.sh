#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

MOCHA_PARALLEL=true $MOCHA_SETUP 

$MOCHA_CMD 'tests/advanced/multiFeature/*.ts' \
           'tests/advanced/coupons/*.ts' \
           'tests/attach/updateQuantity/*.ts' \
           'tests/advanced/referrals/*.ts'
          
# $MOCHA_CMD 'tests/attach/multiProduct/*.ts' 

# $MOCHA_CMD 'tests/advanced/usage/*.ts'
           