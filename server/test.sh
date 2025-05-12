#!/bin/bash
MOCHA_SETUP="npx mocha tests/00_setup.ts"
MOCHA_CMD="npx mocha --parallel --timeout 10000000 --ignore tests/00_setup.ts"

# TEST PARALLEL
if [ "$1" == "basic-parallel" ]; then
    MOCHA_PARALLEL=true $MOCHA_SETUP && $MOCHA_CMD  \
    tests/basic/*.ts \
    tests/basic/multi-feature/*.ts \
    tests/basic/entities/*.ts \
    && $MOCHA_CMD \
    'tests/basic/referrals/*.ts' 'tests/attach/**/*.ts' \



elif [ "$1" == "advanced-parallel" ]; then
    MOCHA_PARALLEL=true  \
    $MOCHA_SETUP \
    && $MOCHA_CMD 'tests/advanced/usage/*.ts' \
    && $MOCHA_CMD 'tests/advanced/arrear_prorated/*.ts' 'tests/advanced/coupons/*.ts'\
    # && $MOCHA_CMD 'tests/advanced/coupons/*.ts'\


elif [ "$1" == "alex-parallel" ]; then
    MOCHA_PARALLEL=true npx mocha 'tests/alex/00_setup.ts' && npx mocha --parallel --timeout 10000000  \
    'tests/alex/01_free.ts' 'tests/alex/02_pro.ts' 'tests/alex/03_premium.ts' \
    'tests/alex/04_topups.ts' 'tests/alex/05_cancel.ts' 'tests/alex/06_switch.ts' \
    --ignore 'tests/alex/00_setup.ts'

elif [ "$1" == "alex" ]; then
    npx mocha 'tests/alex/00_setup.ts' && \
    npx mocha --timeout 10000000 \
    'tests/alex/01_free.ts' \
    --ignore 'tests/alex/00_setup.ts'

elif [ "$1" == "alex-custom" ]; then
    FILE_TO_TEST="$2"
    npx mocha --timeout 10000000 "tests/alex/$FILE_TO_TEST.ts"
elif [ "$1" == "custom" ]; then
    FILE_TO_TEST="$2"
    ARG3="$3"
    if [ "$ARG3" == "setup" ]; then
        npx mocha --timeout 10000000 'tests/00_setup.ts'
    fi
    npx mocha --timeout 10000000 "tests/$FILE_TO_TEST.ts"
else
    npx mocha --timeout 10000000 'tests/00_setup.ts' && npx mocha --timeout 10000000  \
    'tests/**/*.ts' \
    --ignore 'tests/00_setup.ts' \
    --ignore 'tests/alex/**/*.ts'
fi



# All advanced parallel
