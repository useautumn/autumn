#!/bin/bash

MOCHA_SETUP="bunx mocha tests/00_setup.ts"
MOCHA_CMD="bunx mocha --parallel -j 6 --timeout 10000000 --ignore tests/00_setup.ts"  