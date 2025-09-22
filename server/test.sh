#!/bin/bash
MOCHA_SETUP="npx mocha tests/00_setup.ts"
MOCHA_CMD="npx mocha --parallel --timeout 10000000 --ignore tests/00_setup.ts"

# Group 1
if [ "$1" == "group1" ]; then
    $MOCHA_SETUP \
    && $MOCHA_CMD \
    'tests/attach/basic/*.ts' \
    'tests/attach/upgrade/*.ts' \
    'tests/attach/downgrade/*.ts'
fi

# Group 2
if [ "$1" == "g2" ]; then
    $MOCHA_SETUP && $MOCHA_CMD \
    'tests/attach/upgradeOld/*.ts' \
    'tests/attach/entities/*.ts' \
    'tests/attach/migrations/*.ts' \
    'tests/attach/newVersion/*.ts' \
    'tests/attach/others/*.ts' \
    'tests/attach/updateEnts/*.ts' \
    exit 0
fi

if [ "$1" == "g3" ]; then
    $MOCHA_SETUP \
    && $MOCHA_CMD 'tests/contUse/entities/*.ts' \
    && $MOCHA_CMD 'tests/contUse/update/*.ts'\
    && $MOCHA_CMD 'tests/contUse/track/*.ts' \
    exit 0
fi

if [ "$1" == "g4" ]; then
    $MOCHA_SETUP && $MOCHA_CMD \
    'tests/attach/updateQuantity/*.ts' \
    'tests/attach/multiProduct/*.ts' \
    'tests/advanced/multiFeature/*.ts' \
    'tests/advanced/referrals/*.ts' \
    'tests/advanced/coupons/*.ts'
fi

# Group 5 - Paid referrals
if [ "$1" == "paid-referrals" ]; then
    $MOCHA_SETUP && $MOCHA_CMD \
    'tests/advanced/referrals/paid/*.ts'
fi

# Group 4
if [ "$1" == "g4" ]; then
    $MOCHA_SETUP && $MOCHA_CMD \
    'tests/advanced/usage/*.ts'
fi



if [ "$1" == "alex-parallel" ]; then
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
        npx mocha --bail --timeout 10000000 'tests/00_setup.ts'
    elif [ "$ARG3" == "parallel" ]; then
        npx mocha --parallel --bail --timeout 10000000 "tests/$FILE_TO_TEST.ts"
    else
        npx mocha --bail --timeout 10000000 "tests/$FILE_TO_TEST.ts"
    fi
else
    npx mocha --timeout 10000000 'tests/00_setup.ts' && npx mocha --timeout 10000000  \
    'tests/**/*.ts' \
    --ignore 'tests/00_setup.ts' \
    --ignore 'tests/alex/**/*.ts'
fi

# # TEST PARALLEL
# if [ "$1" == "basic-parallel" ]; then
#     MOCHA_PARALLEL=true $MOCHA_SETUP \
#     && $MOCHA_CMD  \
#     'tests/attach/basic/*.ts' \
#     'tests/attach/upgrade/*.ts' \
#     'tests/attach/downgrade/*.ts' \
#     && $MOCHA_CMD \
#     'tests/attach/upgradeOld/*.ts' \
#     'tests/attach/entities/*.ts' \
#     'tests/attach/migrations/*.ts' \
#     'tests/attach/multiProduct/*.ts' \
#     'tests/attach/newVersion/*.ts' \
#     'tests/attach/others/*.ts' \
#     'tests/attach/updateEnts/*.ts' \
#     'tests/attach/updateQuantity/*.ts' \
#     'tests/contUse/entities/*.ts' \
#     'tests/contUse/track/*.ts' \
#     'tests/contUse/update/*.ts' \
#     && $MOCHA_CMD \
#     'tests/advanced/multiFeature/*.ts' \
#     'tests/advanced/referrals/*.ts' \
#     'tests/advanced/coupons/*.ts' \


# elif [ "$1" == "advanced-parallel" ]; then
#     MOCHA_PARALLEL=true  \
#     $MOCHA_SETUP \
#     && $MOCHA_CMD 'tests/advanced/arrear_prorated/*.ts' 'tests/advanced/coupons/*.ts'\
#     # && $MOCHA_CMD 'tests/advanced/usage/*.ts' \
#     # && $MOCHA_CMD 'tests/advanced/coupons/*.ts'\
