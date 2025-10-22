#!/bin/bash

BUN_SETUP="bun tests/setupMain.ts"
MOCHA_CMD="npx mocha --parallel -j 6 --timeout 10000000 --ignore tests/00_setup.ts"  

BUN_CMD="bun test --concurrent"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_PARALLEL="$SCRIPT_DIR/run-parallel.sh"