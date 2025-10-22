#!/usr/bin/env bash

# Run Bun test files in parallel with proper error reporting
# Usage: ./run-parallel.sh <test_directory1> [test_directory2] [...] [--max=N]

if [ $# -eq 0 ]; then
    echo "Error: No test directories specified"
    echo "Usage: ./run-parallel.sh <test_directory1> [test_directory2] [...] [--max=N]"
    exit 1
fi

# Parse arguments
TEST_DIRS=()
MAX_PARALLEL=6

for arg in "$@"; do
    if [[ "$arg" == --max=* ]]; then
        MAX_PARALLEL="${arg#*=}"
    else
        if [ ! -d "$arg" ]; then
            echo "Error: Directory '$arg' not found"
            exit 1
        fi
        TEST_DIRS+=("$arg")
    fi
done

if [ ${#TEST_DIRS[@]} -eq 0 ]; then
    echo "Error: No valid test directories specified"
    exit 1
fi

TEMP_DIR=$(mktemp -d)
FAILED_DIR="$TEMP_DIR/failed"
STATUS_DIR="$TEMP_DIR/status"
mkdir -p "$FAILED_DIR" "$STATUS_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Spinner frames
SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
SPINNER_FRAME=0
NUM_SPINNER_FRAMES=${#SPINNER_FRAMES[@]}

# Collect all test files first
TEST_FILES=()
for TEST_DIR in "${TEST_DIRS[@]}"; do
    for test_file in "$TEST_DIR"/*.test.ts; do
        if [ -f "$test_file" ]; then
            TEST_FILES+=("$test_file")
            # Create status file
            echo "pending" > "$STATUS_DIR/$(basename "$test_file").status"
        fi
    done
done

# Check if any tests were found
if [ ${#TEST_FILES[@]} -eq 0 ]; then
    echo "No test files found in specified directories"
    rm -rf "$TEMP_DIR"
    exit 0
fi

# Helper function to get status
get_status() {
    local test_file="$1"
    local test_name=$(basename "$test_file")
    local status_file="$STATUS_DIR/${test_name}.status"
    if [ -f "$status_file" ]; then
        cat "$status_file"
    else
        echo "pending"
    fi
}

# Helper function to set status
set_status() {
    local test_file="$1"
    local status="$2"
    local test_name=$(basename "$test_file")
    echo "$status" > "$STATUS_DIR/${test_name}.status"
}

# Cleanup function
cleanup() {
    # Stop spinner
    if [ ! -z "$SPINNER_PID" ]; then
        kill $SPINNER_PID 2>/dev/null || true
        wait $SPINNER_PID 2>/dev/null || true
    fi
    
    # Kill all descendant processes
    pkill -P $$ 2>/dev/null || true
    pkill -f "bun test" 2>/dev/null || true
    jobs -p | while read pid; do kill -9 $pid 2>/dev/null || true; done
    
    # Show cursor again
    tput cnorm 2>/dev/null || true
    
    # Clean up temp directory
    rm -rf "$TEMP_DIR"
    exit 130
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Function to render the test list
render_tests() {
    local line_num=1
    
    # Save cursor position
    tput sc 2>/dev/null || true
    
    for test_file in "${TEST_FILES[@]}"; do
        local test_name=$(basename "$test_file")
        local status=$(get_status "$test_file")
        local display_name="${test_name}"
        
        # Move to the line
        tput cup $((line_num - 1)) 0 2>/dev/null || true
        
        # Clear line
        tput el 2>/dev/null || true
        
        case "$status" in
            "pending")
                echo -ne "${DIM}⋯${NC} ${DIM}${display_name}${NC}"
                ;;
            "running")
                local frame_idx=$((SPINNER_FRAME % NUM_SPINNER_FRAMES))
                local spinner_char="${SPINNER_FRAMES[$frame_idx]}"
                echo -ne "${CYAN}${spinner_char}${NC} ${display_name}"
                ;;
            "passed")
                echo -ne "${GREEN}✓${NC} ${DIM}${display_name}${NC}"
                ;;
            "failed")
                echo -ne "${RED}✗${NC} ${display_name}"
                ;;
        esac
        
        ((line_num++))
    done
    
    # Restore cursor position
    tput rc 2>/dev/null || true
}

# Function to update spinner animation
animate_spinner() {
    while true; do
        SPINNER_FRAME=$((SPINNER_FRAME + 1))
        render_tests
        sleep 0.1
    done
}

# Function to run a test
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file")
    local output_file="$TEMP_DIR/$test_name.log"
    
    # Mark as running
    set_status "$test_file" "running"
    
    # Run the test
    if script -q /dev/null bash -c "FORCE_COLOR=3 bun test --timeout 0 '$test_file' 2>&1" > "$output_file"; then
        set_status "$test_file" "passed"
        return 0
    else
        set_status "$test_file" "failed"
        echo "$test_file|$output_file" > "$FAILED_DIR/$test_name.failed"
        return 1
    fi
}

# Hide cursor
tput civis 2>/dev/null || true

# Initial render - create space for all tests
echo ""
for test_file in "${TEST_FILES[@]}"; do
    echo ""
done

# Move cursor back up
tput cuu ${#TEST_FILES[@]} 2>/dev/null || true

# Start spinner animation in background
animate_spinner &
SPINNER_PID=$!

# Run tests in parallel
count=0
for test_file in "${TEST_FILES[@]}"; do
    # Wait if we've hit max parallel
    while [ $(jobs -r | wc -l) -ge $((MAX_PARALLEL + 1)) ]; do
        sleep 0.1
    done
    
    run_test "$test_file" &
    ((count++))
done

# Wait for all tests to complete (exclude spinner process)
for job in $(jobs -p); do
    if [ "$job" != "$SPINNER_PID" ]; then
        wait $job 2>/dev/null || true
    fi
done

# Stop spinner
if [ ! -z "$SPINNER_PID" ]; then
    kill $SPINNER_PID 2>/dev/null || true
    wait $SPINNER_PID 2>/dev/null || true
fi

# Final render
render_tests

# Move cursor below test list
echo ""
echo ""

# Show cursor again
tput cnorm 2>/dev/null || true

# Report failures
FAILED_COUNT=$(ls "$FAILED_DIR"/*.failed 2>/dev/null | wc -l)
if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}${BOLD}========================================"
    echo -e "FAILED TESTS ($FAILED_COUNT/${count}):"
    echo -e "========================================${NC}"
    echo ""
    
    # Show detailed errors
    for failure_file in "$FAILED_DIR"/*.failed; do
        IFS='|' read -r test_file output_file < "$failure_file"
        echo -e "${RED}${BOLD}✗ $(basename $test_file)${NC}"
        echo -e "${DIM}─────────────────────────────────────────${NC}"
        cat "$output_file"
        echo ""
    done
    rm -rf "$TEMP_DIR"
    
    # Remove trap before exit to prevent double cleanup
    trap - SIGINT SIGTERM EXIT
    exit 1
else
    echo -e "${GREEN}${BOLD}✓ All tests passed!${NC} ${CYAN}($count tests)${NC}"
    rm -rf "$TEMP_DIR"
    
    # Remove trap before exit to prevent double cleanup
    trap - SIGINT SIGTERM EXIT
    exit 0
fi
