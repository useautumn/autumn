# npx mocha 'tests/alex/00_setup.ts' --timeout 10000000 

MOCHA_PARALLEL=true npx mocha --parallel --timeout 10000000  \
    'tests/alex/01_free.ts' 'tests/alex/02_pro.ts' 'tests/alex/03_premium.ts' \
    'tests/alex/04_topups.ts' 'tests/alex/05_cancel.ts' 'tests/alex/06_switch.ts' \
    --ignore 'tests/alex/00_setup.ts'