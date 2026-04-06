#!/usr/bin/env bash
# Audits Firecrawl CREDITS events in the `events` table, month by month (Apr 2024 - Apr 2026).
# Queries day-by-day within each month to avoid the 10s timeout, then sums.
# Checks: total rows, v2 rows, non-v2 rows, v2 credits, non-v2 credits, ratio.
# Theory: non-v2 credits ≈ 2x v2 credits (v1 backfill + SDK ≈ 2x BQ source of truth)
#
# Usage: ./scripts/firecrawl-events-credit-audit.sh

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

printf "\n%-18s %14s %14s %14s %16s %16s %9s\n" \
  "Month" "Total Rows" "v2 Rows" "Non-v2 Rows" "v2 Credits" "Non-v2 Credits" "Ratio"
printf '%s\n' "$(printf '%.0s-' {1..108})"

for i in "${!MONTHS[@]}"; do
  month="${MONTHS[$i]}"
  label="${MONTH_LABELS[$i]}"
  year="${month:0:4}"
  mon="${month:4:2}"

  total=0; v2_rows=0; non_v2_rows=0; v2_credits=0; non_v2_credits=0

  for day in $(seq -w 1 31); do
    date_str="${year}-${mon}-${day}"

    # Validate date exists (skip invalid days like Feb 30)
    date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue

    next_date=$(date -j -v+1d -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" 2>/dev/null) || continue

    # Special case: April 2026 only audit up to Apr 4 14:53 UTC
    if [[ "$month" == "202604" ]]; then
      if [[ "$date_str" > "2026-04-04" ]]; then continue; fi
      if [[ "$date_str" == "2026-04-04" ]]; then
        ts_end="2026-04-04 14:53:00"
      else
        ts_end="$next_date"
      fi
    else
      ts_end="$next_date"
    fi

    base="FROM events WHERE org_id = '$ORG_ID' AND event_name = 'CREDITS' AND toYYYYMM(timestamp) = $month AND timestamp >= '$date_str' AND timestamp < '$ts_end'"

    d_total=$(query    "SELECT count()                                FROM $base")
    d_v2=$(query       "SELECT count()                                FROM $base AND properties.backfill_version = 2")
    d_non_v2=$(query   "SELECT count()                                FROM $base AND (properties.backfill_version != 2 OR properties.backfill_version IS NULL)")
    d_v2c=$(query      "SELECT round(sum(toFloat64(value)))           FROM $base AND properties.backfill_version = 2")
    d_non_v2c=$(query  "SELECT round(sum(toFloat64(value)))           FROM $base AND (properties.backfill_version != 2 OR properties.backfill_version IS NULL)")

    total=$((total + d_total))
    v2_rows=$((v2_rows + d_v2))
    non_v2_rows=$((non_v2_rows + d_non_v2))
    v2_credits=$((v2_credits + d_v2c))
    non_v2_credits=$((non_v2_credits + d_non_v2c))
  done

  printf "%-18s %14s %14s %14s %16s %16s" \
    "$label" "$total" "$v2_rows" "$non_v2_rows" "$v2_credits" "$non_v2_credits"

  if [[ "$non_v2_rows" == "0" ]]; then
    printf " %9s" "clean ✓"
  elif [[ "$v2_credits" -gt 0 && "$non_v2_credits" -gt 0 ]]; then
    ratio=$(echo "scale=2; $non_v2_credits / $v2_credits" | bc)
    printf " %9s" "${ratio}x"
  else
    printf " %9s" "N/A"
  fi

  printf "\n"
done

printf '%s\n' "$(printf '%.0s-' {1..108})"
printf "\nTheory: non-v2 credits ≈ 2x v2 credits (v1 backfill + SDK ≈ 2x BQ source of truth)\n"
printf "Ratio ~2.00x = needs cleanup | 'clean ✓' = already done\n\n"
