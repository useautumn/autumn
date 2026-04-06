#!/usr/bin/env bash
# Runs --dry-run deletions for all 3 tables across all affected months.
# Queries day-by-day within each month to avoid the 10s timeout, sums the counts.
# Parses row counts from tb CLI dry-run output and builds a summary table.
# No data is modified - dry-run only.
#
# Tables:
#   events               - condition: properties.backfill_version IS NULL OR != 2
#   events_hourly_mv     - condition: JSONExtractString(toString(properties), 'backfill_version') != '2'
#   events_by_timestamp_mv - condition: JSONExtractString(properties, 'backfill_version') != '2'
#
# Special case: April 2026 only deletes Apr 2 - Apr 4 14:53:00 UTC (15:53 BST cutoff)
#
# Usage: ./scripts/firecrawl-dry-run-deletions.sh

ORG_ID="biu9vSF7vghBLSKW1UTDwxHBAivjnPaK"

MONTHS=()
MONTH_LABELS=()
for year in 2024 2025 2026; do
  for month in 01 02 03 04 05 06 07 08 09 10 11 12; do
    ym="${year}${month}"
    if [[ "$ym" < "202404" || "$ym" > "202604" ]]; then continue; fi
    MONTHS+=("$ym")
    label=$(date -j -f "%Y%m%d" "${ym}01" "+%b %Y" 2>/dev/null || echo "$ym")
    MONTH_LABELS+=("$label")
  done
done

dry_run_count() {
  echo "$1" | grep -oE "rows '[0-9]+'" | grep -oE "[0-9]+" || echo "0"
}

printf "\n=== Firecrawl Deletion Dry-Run (day-by-day) ===\n"
printf "Org: %s\n" "$ORG_ID"
printf "April cutoff: 2026-04-04 14:53:00 UTC (15:53 BST)\n\n"

printf "%-18s %20s %20s %24s\n" "Month" "events" "events_hourly_mv" "events_by_timestamp_mv"
printf '%s\n' "$(printf '%.0s-' {1..87})"

TOTAL_EVENTS=0
TOTAL_HOURLY=0
TOTAL_TIMESTAMP=0

for i in "${!MONTHS[@]}"; do
  month="${MONTHS[$i]}"
  label="${MONTH_LABELS[$i]}"
  year="${month:0:4}"
  mon="${month:4:2}"

  month_events=0; month_hourly=0; month_timestamp=0

  for day in $(seq -w 1 31); do
    date_str="${year}-${mon}-${day}"
    date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue
    next_date=$(date -j -v+1d -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" 2>/dev/null) || continue

    # April 2026: skip Apr 1 (already cleaned), skip after Apr 4
    if [[ "$month" == "202604" ]]; then
      if [[ "$date_str" < "2026-04-02" || "$date_str" > "2026-04-04" ]]; then continue; fi
      if [[ "$date_str" == "2026-04-04" ]]; then ts_end="2026-04-04 14:53:00"; else ts_end="$next_date"; fi
    else
      ts_end="$next_date"
    fi

    # events
    out=$(tb --cloud datasource delete events --dry-run --wait \
      --sql-condition "org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(timestamp) = $month AND timestamp >= '$date_str' AND timestamp < '$ts_end' AND (properties.backfill_version IS NULL OR properties.backfill_version != 2)" \
      2>&1)
    n=$(dry_run_count "$out")
    month_events=$((month_events + n))

    # events_hourly_mv
    out=$(tb --cloud datasource delete events_hourly_mv --dry-run --wait \
      --sql-condition "org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(hour) = $month AND hour >= '$date_str' AND hour < '$ts_end' AND JSONExtractString(toString(properties), 'backfill_version') != '2'" \
      2>&1)
    n=$(dry_run_count "$out")
    month_hourly=$((month_hourly + n))

    # events_by_timestamp_mv
    out=$(tb --cloud datasource delete events_by_timestamp_mv --dry-run --wait \
      --sql-condition "org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(timestamp) = $month AND timestamp >= '$date_str' AND timestamp < '$ts_end' AND JSONExtractString(properties, 'backfill_version') != '2'" \
      2>&1)
    n=$(dry_run_count "$out")
    month_timestamp=$((month_timestamp + n))
  done

  printf "%-18s %20s %20s %24s\n" "$label" "$month_events" "$month_hourly" "$month_timestamp"

  TOTAL_EVENTS=$((TOTAL_EVENTS + month_events))
  TOTAL_HOURLY=$((TOTAL_HOURLY + month_hourly))
  TOTAL_TIMESTAMP=$((TOTAL_TIMESTAMP + month_timestamp))
done

printf '%s\n' "$(printf '%.0s-' {1..87})"
printf "%-18s %20s %20s %24s\n" "TOTAL" "$TOTAL_EVENTS" "$TOTAL_HOURLY" "$TOTAL_TIMESTAMP"
printf '%s\n' "$(printf '%.0s-' {1..87})"
printf "\nAll numbers are DRY RUN only - no data has been deleted.\n"
printf "If totals look correct, re-run without --dry-run to execute.\n\n"
