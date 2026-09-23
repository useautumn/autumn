#!/bin/bash
# Chunked history backfill for events_customer_property_coverage_hourly_mv.
#
# Runs copies/events_customer_property_coverage_hourly_mv_backfill.pipe over half-open
# [start, end) windows on on-demand compute, oldest -> newest, one job at a time.
#
# Usage:
#   ./scripts/backfill_customer_property_coverage.sh --start "YYYY-MM-DD HH:00:00" --end "YYYY-MM-DD HH:00:00" [--chunk-hours N]
#
# --end must be <= the MV's promote hour (the forward trigger owns everything after it).
# Re-run with a later --start to resume; each chunk prints the resume command.
# Requires TB_TOKEN / TB_HOST for autumn_us_east_prod in the environment (infisical prod).

set -euo pipefail
cd "$(dirname "$0")/../.."  # server/, the folder tb tracks for this project

START=""; END=""; CHUNK_HOURS=24
while [[ $# -gt 0 ]]; do
    case $1 in
        --start) START="$2"; shift 2 ;;
        --end) END="$2"; shift 2 ;;
        --chunk-hours) CHUNK_HOURS="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done
[[ -z "$START" || -z "$END" ]] && { echo "--start and --end are required"; exit 1; }

PIPE="events_customer_property_coverage_hourly_mv_backfill"
TB="uvx --from tinybird tb --cloud"
export TB_VERSION_WARNING=0

to_ts() { date -j -f "%Y-%m-%d %H:%M:%S" "$1" "+%s"; }
add_hours() { date -j -v+"$2"H -f "%Y-%m-%d %H:%M:%S" "$1" "+%Y-%m-%d %H:%M:%S"; }

wait_for_copy_jobs() {
    local attempt=0
    while [[ $attempt -lt 120 ]]; do
        local active
        active=$( { $TB job ls --status waiting --kind copy; $TB job ls --status working --kind copy; } 2>/dev/null | grep -c "^id:" ) || active=0
        [[ "$active" -eq 0 ]] && return 0
        [[ $attempt -eq 0 ]] && echo "  waiting for $active running copy job(s)..."
        sleep 5; attempt=$((attempt + 1))
    done
    echo "Timed out waiting for existing copy jobs"; exit 1
}

CURRENT="$START"
while [[ $(to_ts "$CURRENT") -lt $(to_ts "$END") ]]; do
    NEXT=$(add_hours "$CURRENT" "$CHUNK_HOURS")
    [[ $(to_ts "$NEXT") -gt $(to_ts "$END") ]] && NEXT="$END"

    echo "=== $CURRENT -> $NEXT ==="
    wait_for_copy_jobs
    T0=$(date +%s)
    attempt=1
    until $TB copy run "$PIPE" --on-demand-compute --wait \
            --param start_date="$CURRENT" --param end_date="$NEXT"; do
        [[ $attempt -ge 3 ]] && { echo "chunk failed 3 times; resume with --start '$CURRENT'"; exit 1; }
        attempt=$((attempt + 1)); echo "  retry $attempt in 30s..."; sleep 30
    done
    echo "✓ done in $(( $(date +%s) - T0 ))s. resume point: --start '$NEXT'"
    CURRENT="$NEXT"
done
echo "=== backfill complete: $START -> $END ==="
