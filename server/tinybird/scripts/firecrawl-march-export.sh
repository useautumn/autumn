#!/usr/bin/env bash
# Step 1: Export ALL rows for each day of March 2026, hour by hour, to NDJSON files.
# Exports per hour to stay under Tinybird's 100MB export limit, then concatenates into daily files.
# Output: ./march-export/day-YYYY-MM-DD.ndjson
#
# Usage: ./scripts/firecrawl-march-export.sh
# Run from: sirtenzin-autumn/server/tinybird/

set -euo pipefail

ORG_ID="biu9vSF7vghBLSKW1UTDwxHBAivjnPaK"
OUTPUT_DIR="$(pwd)/march-export"
TMP_DIR="$(pwd)/march-export-tmp"
mkdir -p "$OUTPUT_DIR" "$TMP_DIR"

echo "=== Firecrawl March 2026 - Export ALL rows (hourly chunks) ==="
echo "Output dir: $OUTPUT_DIR"
echo ""

DAYS=()
for day in $(seq -w 1 31); do
  date_str="2026-03-${day}"
  date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue
  DAYS+=("$date_str")
done

TOTAL_DAYS=${#DAYS[@]}
COMPLETED=0
DAY_TIMES=()
SCRIPT_START=$(date +%s)

for date_str in "${DAYS[@]}"; do
  outfile="${OUTPUT_DIR}/day-${date_str}.ndjson"
  if [[ -f "$outfile" ]]; then
    echo "[${date_str}] Already exported ($(wc -l < "$outfile" | tr -d ' ') rows), skipping."
    COMPLETED=$((COMPLETED + 1))
    continue
  fi

  DAY_START=$(date +%s)
  echo "[${date_str}] Exporting hour by hour... ($((COMPLETED + 1))/${TOTAL_DAYS})"
  > "${TMP_DIR}/day-${date_str}.ndjson"

  for hour in $(seq -w 0 23); do
    for chunk_start_min in 0 10 20 30 40 50; do
      chunk_end_min=$((chunk_start_min + 9))
      hour_start=$(printf "%s %s:%02d:00" "$date_str" "$hour" "$chunk_start_min")
      hour_end=$(printf "%s %s:%02d:59" "$date_str" "$hour" "$chunk_end_min")
      tmpfile="${TMP_DIR}/chunk-${date_str}-${hour}-${chunk_start_min}.ndjson"

      tb --cloud datasource export events \
        --format ndjson \
        --rows 100000000 \
        --where "toYYYYMM(timestamp) = 202603 AND timestamp >= '${hour_start}' AND timestamp <= '${hour_end}' AND org_id = '${ORG_ID}'" \
        --target "$tmpfile"

      if [[ -f "$tmpfile" ]]; then
        cat "$tmpfile" >> "${TMP_DIR}/day-${date_str}.ndjson"
        rm -f "$tmpfile"
      fi
    done
  done

  mv "${TMP_DIR}/day-${date_str}.ndjson" "$outfile"
  row_count=$(wc -l < "$outfile" | tr -d ' ')
  COMPLETED=$((COMPLETED + 1))

  DAY_END=$(date +%s)
  DAY_ELAPSED=$((DAY_END - DAY_START))
  DAY_TIMES+=("$DAY_ELAPSED")

  # Rolling average ETA (last 5 days)
  WINDOW=5
  WINDOW_START=$(( ${#DAY_TIMES[@]} - WINDOW ))
  [[ $WINDOW_START -lt 0 ]] && WINDOW_START=0
  WINDOW_TIMES=("${DAY_TIMES[@]:$WINDOW_START}")
  SUM=0
  for t in "${WINDOW_TIMES[@]}"; do SUM=$((SUM + t)); done
  AVG=$((SUM / ${#WINDOW_TIMES[@]}))
  REMAINING=$((TOTAL_DAYS - COMPLETED))
  ETA_SECS=$((REMAINING * AVG))
  ETA_MIN=$((ETA_SECS / 60))
  TOTAL_ELAPSED=$(( DAY_END - SCRIPT_START ))
  ELAPSED_MIN=$((TOTAL_ELAPSED / 60))

  echo "[${date_str}] Done - ${row_count} rows | ${DAY_ELAPSED}s | ${COMPLETED}/${TOTAL_DAYS} days | ${ELAPSED_MIN}min elapsed | ETA ~${ETA_MIN}min (avg ${AVG}s/day)"
done

rm -rf "$TMP_DIR"
echo ""
echo "=== Export complete ==="
ls -lh "$OUTPUT_DIR"
