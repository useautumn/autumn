#!/bin/bash
# Chunked history backfill for events_customer_property_coverage_hourly_mv.
#
# Runs copies/events_customer_property_coverage_hourly_mv_backfill.pipe over half-open
# [start, end) windows on on-demand compute, one job at a time per invocation. Several
# invocations may run at once on DISJOINT ranges (Tinybird caps concurrent copy jobs at 6).
#
# Usage:
#   ./scripts/backfill_customer_property_coverage.sh --start "YYYY-MM-DD HH:00:00" --end "YYYY-MM-DD HH:00:00" [--chunk-hours N]
#
# Lessons from the 2026-09-23 run (see tickets/EVENTS_AGGREGATE_PROPERTY_ROLLUP.md):
# - A window that already holds rows is skipped, but the check only sees rows after a copy
#   lands, so two workers on the SAME range can both copy a day. Keep ranges disjoint and
#   verify per-day parity against events_org_property_coverage_hourly_mv afterwards.
# - To redo a day: delete its rows, then copy it with a DIFFERENT --chunk-hours than before.
#   Re-inserting identical blocks gets silently dropped by replicated insert dedup.
# - Every --end must be <= the MV promote hour; the forward trigger owns everything after.
# Requires TB_TOKEN / TB_HOST for autumn_us_east_prod in the environment.

set -euo pipefail
cd "$(dirname "$0")/../.."

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
MV="events_customer_property_coverage_hourly_mv"
TB="uvx --from tinybird tb --cloud"
export TB_VERSION_WARNING=0

to_ts() { date -j -f "%Y-%m-%d %H:%M:%S" "$1" "+%s"; }
add_hours() { date -j -v+"$2"H -f "%Y-%m-%d %H:%M:%S" "$1" "+%Y-%m-%d %H:%M:%S"; }
rows_in_window() {
    curl -s -m 60 "$TB_HOST/v0/sql" -H "Authorization: Bearer $TB_TOKEN" \
        --data-urlencode "q=SELECT count() FROM $MV WHERE hour >= '$1' AND hour < '$2' FORMAT TSV"
}

CURRENT="$START"
while [[ $(to_ts "$CURRENT") -lt $(to_ts "$END") ]]; do
    NEXT=$(add_hours "$CURRENT" "$CHUNK_HOURS")
    [[ $(to_ts "$NEXT") -gt $(to_ts "$END") ]] && NEXT="$END"

    existing=$(rows_in_window "$CURRENT" "$NEXT" | tr -d '[:space:]')
    if [[ "$existing" =~ ^[0-9]+$ && "$existing" -gt 0 ]]; then
        echo "skip $CURRENT -> $NEXT (already $existing rows)"
        CURRENT="$NEXT"; continue
    fi

    echo "=== $CURRENT -> $NEXT ==="
    T0=$(date +%s)
    attempt=1
    until $TB copy run "$PIPE" --on-demand-compute --wait \
            --param start_date="$CURRENT" --param end_date="$NEXT"; do
        [[ $attempt -ge 30 ]] && { echo "chunk failed 30 times; resume with --start '$CURRENT'"; exit 1; }
        attempt=$((attempt + 1)); delay=$((20 + RANDOM % 40)); echo "  retry $attempt in ${delay}s..."; sleep $delay
    done
    echo "✓ done in $(( $(date +%s) - T0 ))s. resume point: --start '$NEXT'"
    CURRENT="$NEXT"
done
echo "=== backfill complete: $START -> $END ==="
