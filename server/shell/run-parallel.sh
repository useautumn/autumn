#!/bin/bash

# Run Bun test files in parallel with proper error reporting
# Usage: ./run-parallel.sh <test_directory> [max_parallel]

TEST_DIR="$1"
MAX_PARALLEL="${2:-6}"

if [ -z "$TEST_DIR" ]; then
    echo "Error: No test directory specified"
    echo "Usage: ./run-parallel.sh <test_directory> [max_parallel]"
    exit 1
fi

if [ ! -d "$TEST_DIR" ]; then
    echo "Error: Directory '$TEST_DIR' not found"
    exit 1
fi

TEMP_DIR=$(mktemp -d)
FAILED_DIR="$TEMP_DIR/failed"
mkdir -p "$FAILED_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Stopping all tests...${NC}"
    
    # Kill all descendant processes (including bun test processes)
    pkill -P $$ 2>/dev/null || true
    
    # Also kill any bun test processes that might be running
    pkill -f "bun test" 2>/dev/null || true
    
    # Kill all background jobs
    jobs -p | while read pid; do kill -9 $pid 2>/dev/null || true; done
    
    # Clean up temp directory
    rm -rf "$TEMP_DIR"
    exit 130
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Function to run a test and capture output
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file")
    local output_file="$TEMP_DIR/$test_name.log"
    
    echo -e "${CYAN}Running:${NC} $test_name"
    # Force color output from bun test using script to simulate TTY
    if script -q /dev/null bash -c "FORCE_COLOR=3 bun test --timeout 0 '$test_file' 2>&1" > "$output_file"; then
        echo -e "${GREEN}✓ PASSED:${NC} $test_name"
        return 0
    else
        echo -e "${RED}✗ FAILED:${NC} $test_name"
        # Create a marker file for failed test
        echo "$test_file|$output_file" > "$FAILED_DIR/$test_name.failed"
        return 1
    fi
}

count=0
for test_file in "$TEST_DIR"/*.test.ts; do
    # Skip if no test files found
    if [ ! -f "$test_file" ]; then
        echo "No test files found in $TEST_DIR"
        rm -rf "$TEMP_DIR"
        exit 0
    fi
    
    # Wait if we've hit max parallel
    while [ $(jobs -r | wc -l) -ge $MAX_PARALLEL ]; do
        sleep 0.1
    done
    
    run_test "$test_file" &
    ((count++))
done

# Wait for all remaining jobs
wait

# Report failures
FAILED_COUNT=$(ls "$FAILED_DIR"/*.failed 2>/dev/null | wc -l)
if [ $FAILED_COUNT -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}========================================"
    echo -e "FAILED TESTS ($FAILED_COUNT total):"
    echo -e "========================================${NC}"
    
    # First, list all failed test names
    for failure_file in "$FAILED_DIR"/*.failed; do
        IFS='|' read -r test_file output_file < "$failure_file"
        echo -e "${RED}  ✗${NC} $(basename $test_file)"
    done
    
    echo ""
    echo -e "${YELLOW}${BOLD}Detailed Errors:${NC}"
    echo ""
    
    # Then show detailed errors
    for failure_file in "$FAILED_DIR"/*.failed; do
        IFS='|' read -r test_file output_file < "$failure_file"
        echo -e "${YELLOW}--- FAILURE: ${BOLD}$(basename $test_file)${NC}${YELLOW} ---${NC}"
        cat "$output_file"
        echo ""
    done
    rm -rf "$TEMP_DIR"
    exit 1
else
    echo ""
    echo -e "${GREEN}${BOLD}✓ All tests passed!${NC} ${CYAN}($count tests)${NC}"
    rm -rf "$TEMP_DIR"
    exit 0
fi

