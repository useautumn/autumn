#!/usr/bin/env bash
# Audits Firecrawl CREDITS in events_hourly_mv and events_by_timestamp_mv (Apr 2024 - Apr 2026).
# Queries day-by-day within each month to avoid the 10s timeout, then sums.
#
# events_hourly_mv:        partition key = toYYYYMM(hour),      properties = JSON
# events_by_timestamp_mv:  partition key = toYYYYMM(timestamp), properties = Nullable(String)
#
# Usage: ./scripts/firecrawl-mvs-credit-audit.sh

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

query() {
  local result
  result=$(tb --cloud sql "$1" 2>/dev/null | grep -E '^\s+[0-9]' | tr -d ' ')
  echo "${result:-0}"
}

# ── events_hourly_mv ──────────────────────────────────────────────────────────

printf "\n=== events_hourly_mv (properties = JSON, partition = toYYYYMM(hour)) ===\n\n"
printf "%-18s %14s %14s %9s\n" "Month" "Total Rows" "Non-v2 Rows" "Clean?"
printf '%s\n' "$(printf '%.0s-' {1..60})"

for i in "${!MONTHS[@]}"; do
  month="${MONTHS[$i]}"
  label="${MONTH_LABELS[$i]}"
  year="${month:0:4}"
  mon="${month:4:2}"

  total=0; non_v2=0

  for day in $(seq -w 1 31); do
    date_str="${year}-${mon}-${day}"
    date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue
    next_date=$(date -j -v+1d -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" 2>/dev/null) || continue

    if [[ "$month" == "202604" ]]; then
      if [[ "$date_str" > "2026-04-04" ]]; then continue; fi
      if [[ "$date_str" == "2026-04-04" ]]; then ts_end="2026-04-04 14:53:00"; else ts_end="$next_date"; fi
    else
      ts_end="$next_date"
    fi

    base="FROM events_hourly_mv WHERE org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(hour) = $month AND hour >= '$date_str' AND hour < '$ts_end'"

    d_total=$(query  "SELECT count() $base")
    d_non_v2=$(query "SELECT count() $base AND JSONExtractString(toString(properties), 'backfill_version') != '2'")

    total=$((total + d_total))
    non_v2=$((non_v2 + d_non_v2))
  done

  printf "%-18s %14s %14s" "$label" "$total" "$non_v2"
  if [[ "$non_v2" == "0" ]]; then printf "  clean ✓"; else printf "  needs cleanup"; fi
  printf "\n"
done

printf '%s\n' "$(printf '%.0s-' {1..60})"

# ── events_by_timestamp_mv ────────────────────────────────────────────────────

printf "\n=== events_by_timestamp_mv (properties = Nullable(String), partition = toYYYYMM(timestamp)) ===\n\n"
printf "%-18s %14s %14s %9s\n" "Month" "Total Rows" "Non-v2 Rows" "Clean?"
printf '%s\n' "$(printf '%.0s-' {1..60})"

for i in "${!MONTHS[@]}"; do
  month="${MONTHS[$i]}"
  label="${MONTH_LABELS[$i]}"
  year="${month:0:4}"
  mon="${month:4:2}"

  total=0; non_v2=0

  for day in $(seq -w 1 31); do
    date_str="${year}-${mon}-${day}"
    date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue
    next_date=$(date -j -v+1d -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" 2>/dev/null) || continue

    if [[ "$month" == "202604" ]]; then
      if [[ "$date_str" > "2026-04-04" ]]; then continue; fi
      if [[ "$date_str" == "2026-04-04" ]]; then ts_end="2026-04-04 14:53:00"; else ts_end="$next_date"; fi
    else
      ts_end="$next_date"
    fi

    base="FROM events_by_timestamp_mv WHERE org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(timestamp) = $month AND timestamp >= '$date_str' AND timestamp < '$ts_end'"

    d_total=$(query  "SELECT count() $base")
    d_non_v2=$(query "SELECT count() $base AND JSONExtractString(properties, 'backfill_version') != '2'")

    total=$((total + d_total))
    non_v2=$((non_v2 + d_non_v2))
  done

  printf "%-18s %14s %14s" "$label" "$total" "$non_v2"
  if [[ "$non_v2" == "0" ]]; then printf "  clean ✓"; else printf "  needs cleanup"; fi
  printf "\n"
done

printf '%s\n' "$(printf '%.0s-' {1..60})"
printf "\nNote: deletions on events do NOT cascade to these MVs - run firecrawl-dry-run-deletions.sh\n\n"
