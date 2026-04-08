#!/usr/bin/env bash
# For each day in March 2026:
#   1. Export only v2 rows to a temp NDJSON file
#   2. Replace that day's partition slice with the exported data
#
# The replace atomically removes all rows matching the condition and re-inserts
# the exported v2-only rows - eliminating the duplicates from the reimport.
#
# Usage: ./scripts/firecrawl-march-replace.sh
#
# Run from sirtenzin-autumn/server/tinybird/

set -euo pipefail

ORG_ID="biu9vSF7vghBLSKW1UTDwxHBAivjnPaK"
TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

echo "=== Firecrawl March 2026 - Dedupe via replace ==="
echo "Temp dir: $TMPDIR_BASE"
echo ""

for day in $(seq -w 1 31); do
  date_str="2026-03-${day}"
  next_date=$(date -j -v+1d -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" 2>/dev/null) || continue
  # Validate date
  date -j -f "%Y-%m-%d" "$date_str" "+%Y-%m-%d" &>/dev/null || continue

  tmpfile="${TMPDIR_BASE}/march-${day}.ndjson"

  echo "[${date_str}] Exporting v2 rows..."
  tb --cloud datasource export events \
    --format ndjson \
    --where "toYYYYMM(timestamp) = 202603 AND timestamp >= '${date_str}' AND timestamp < '${next_date}' AND org_id = '${ORG_ID}' AND properties.backfill_version = 2" \
    --target "$tmpfile"

  row_count=$(wc -l < "$tmpfile" | tr -d ' ')
  echo "[${date_str}] Exported ${row_count} v2 rows. Replacing..."

  tb --cloud datasource replace events "$tmpfile" \
    --sql-condition "toYYYYMM(timestamp) = 202603 AND timestamp >= '${date_str}' AND timestamp < '${next_date}' AND org_id = '${ORG_ID}'"

  echo "[${date_str}] Done."
  rm -f "$tmpfile"
  echo ""
done

echo "=== All days complete ==="
