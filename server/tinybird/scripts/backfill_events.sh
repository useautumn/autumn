#!/bin/bash
# Backfill events from Postgres to Tinybird
# Usage: ./backfill_events.sh [--start-date "YYYY-MM-DD HH:MM:SS"]
#
# Developer plan limit: 30s execution time per Copy Pipe
# Chunks are generated dynamically based on boundaries below.
#
# Examples:
#   ./backfill_events.sh                                    # Start from beginning (will prompt to truncate)
#   ./backfill_events.sh --start-date "2025-12-12 00:00:00" # Resume from Dec 12 midnight (skips truncate)

set -e  # Exit on first failure

cd "$(dirname "$0")/.."  # Navigate to server/tinybird

# Parse arguments
START_DATE_ARG=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --start-date)
            START_DATE_ARG="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./backfill_events.sh [--start-date \"YYYY-MM-DD HH:MM:SS\"]"
            exit 1
            ;;
    esac
done

echo "=== Events Backfill Script ==="
echo ""

# Only truncate if no start date specified
if [[ -z "$START_DATE_ARG" ]]; then
    read -p "This will TRUNCATE the events datasource first. Continue? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi

    echo ""
    echo "Truncating events datasource..."
    tb --cloud datasource truncate events --yes
    echo "Truncated."
    echo ""
else
    echo "Resuming from $START_DATE_ARG (skipping truncate)"
    echo ""
fi

# Boundaries define when chunk size changes
# Format: "boundary_date,hours_per_chunk"
# From each boundary until the next, use that chunk size
BOUNDARIES=(
    "2025-10-01 00:00:00,72"   # Oct 1: 3-day (72 hour) chunks
    "2025-12-03 00:00:00,24"   # Dec 3: 1-day (24 hour) chunks  
    "2025-12-12 00:00:00,3"    # Dec 12: 3-hour chunks (high volume)
)
END_DATE="2026-01-26 00:00:00"

# Function to add hours to a date (macOS compatible)
add_hours() {
    local dt="$1"
    local hours="$2"
    date -j -v+"${hours}H" -f "%Y-%m-%d %H:%M:%S" "$dt" "+%Y-%m-%d %H:%M:%S"
}

# Function to compare dates (returns 0 if d1 < d2)
date_lt() {
    local d1="$1"
    local d2="$2"
    local ts1=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d1" "+%s")
    local ts2=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d2" "+%s")
    [[ $ts1 -lt $ts2 ]]
}

# Function to compare dates (returns 0 if d1 <= d2)
date_le() {
    local d1="$1"
    local d2="$2"
    local ts1=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d1" "+%s")
    local ts2=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d2" "+%s")
    [[ $ts1 -le $ts2 ]]
}

# Function to compare dates (returns 0 if d1 >= d2)
date_ge() {
    local d1="$1"
    local d2="$2"
    local ts1=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d1" "+%s")
    local ts2=$(date -j -f "%Y-%m-%d %H:%M:%S" "$d2" "+%s")
    [[ $ts1 -ge $ts2 ]]
}

# Get chunk size for a given date
get_chunk_hours() {
    local dt="$1"
    local chunk_hours=72  # default
    
    for boundary in "${BOUNDARIES[@]}"; do
        IFS=',' read -r boundary_date hours <<< "$boundary"
        if date_ge "$dt" "$boundary_date"; then
            chunk_hours=$hours
        fi
    done
    
    echo $chunk_hours
}

# Generate all chunks
echo "Generating chunks..."
CHUNKS=()
CURRENT="${BOUNDARIES[0]%%,*}"  # Start from first boundary

while date_lt "$CURRENT" "$END_DATE"; do
    CHUNK_HOURS=$(get_chunk_hours "$CURRENT")
    NEXT=$(add_hours "$CURRENT" "$CHUNK_HOURS")
    
    # Don't go past end date
    if date_lt "$END_DATE" "$NEXT"; then
        NEXT="$END_DATE"
    fi
    
    CHUNKS+=("$CURRENT,$NEXT")
    CURRENT="$NEXT"
done

TOTAL_CHUNKS=${#CHUNKS[@]}
echo "Generated $TOTAL_CHUNKS chunks"
echo ""

# Find starting chunk based on --start-date
START_CHUNK=1
if [[ -n "$START_DATE_ARG" ]]; then
    FOUND=false
    for i in "${!CHUNKS[@]}"; do
        IFS=',' read -r CHUNK_START CHUNK_END <<< "${CHUNKS[$i]}"
        if [[ "$CHUNK_START" == "$START_DATE_ARG" ]]; then
            START_CHUNK=$((i + 1))
            FOUND=true
            break
        fi
    done
    if [[ "$FOUND" == false ]]; then
        echo "Error: No chunk starts on '$START_DATE_ARG'"
        echo ""
        echo "Hint: Chunks start at these times based on boundaries:"
        for boundary in "${BOUNDARIES[@]}"; do
            IFS=',' read -r boundary_date hours <<< "$boundary"
            echo "  From $boundary_date: ${hours}-hour chunks"
        done
        exit 1
    fi
fi

echo "Starting backfill: chunks $START_CHUNK-$TOTAL_CHUNKS (of $TOTAL_CHUNKS total)"
echo ""

for i in "${!CHUNKS[@]}"; do
    CHUNK_NUM=$((i + 1))
    
    # Skip chunks before start chunk
    if [[ $CHUNK_NUM -lt $START_CHUNK ]]; then
        continue
    fi
    
    IFS=',' read -r CHUNK_START CHUNK_END <<< "${CHUNKS[$i]}"
    
    echo "=== Chunk $CHUNK_NUM/$TOTAL_CHUNKS: $CHUNK_START -> $CHUNK_END ==="
    
    START_TIME=$(date +%s)
    
    tb --cloud copy run events_backfill \
        --param start_date="$CHUNK_START" \
        --param end_date="$CHUNK_END" \
        --wait
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    # Get current row count
    ROW_COUNT=$(tb --cloud sql "SELECT count() FROM events" --format csv 2>/dev/null | tail -1)
    
    echo ""
    echo "✓ Chunk $CHUNK_NUM COMPLETE ($CHUNK_START -> $CHUNK_END) in ${DURATION}s. Total rows: $ROW_COUNT"
    echo ""
    
    # Show next chunk info
    if [[ $CHUNK_NUM -lt $TOTAL_CHUNKS ]]; then
        NEXT_IDX=$CHUNK_NUM
        IFS=',' read -r NEXT_START NEXT_END <<< "${CHUNKS[$NEXT_IDX]}"
        echo "  To resume: ./scripts/backfill_events.sh --start-date '$NEXT_START'"
        echo "  Waiting 3s..."
        sleep 3
    fi
    echo ""
done

echo "=========================================="
echo "=== Backfill Complete ==="
FINAL_COUNT=$(tb --cloud sql "SELECT count() FROM events" --format csv 2>/dev/null | tail -1)
echo "Final row count: $FINAL_COUNT"
