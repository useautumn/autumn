#!/bin/bash
# Benchmark: Global Top 9 vs Per-Bin Top 9 grouping approaches
# Tests with both low cardinality (billing_source) and high cardinality (session_id)

set -e
cd "$(dirname "$0")/.."

ORG_ID="0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx"
ENV="live"
START_DATE="2024-01-01 00:00:00"
END_DATE="2025-12-31 23:59:59"
RUNS=10

echo "=== Benchmark: Global Top 9 vs Per-Bin Top 9 ==="
echo "Org: $ORG_ID"
echo "Runs: $RUNS"
echo ""

run_benchmark() {
  local name="$1"
  local query_file="$2"
  local times=()
  
  echo "--- $name ---"
  
  for i in $(seq 1 $RUNS); do
    result=$(tb --cloud sql --stats "$(cat $query_file)" 2>&1)
    elapsed=$(echo "$result" | grep "Query took" | awk '{print $4}')
    if [ -z "$elapsed" ]; then
      echo "  Run $i: ERROR"
      echo "$result" | head -5
      continue
    fi
    times+=("$elapsed")
    printf "  Run %2d: %ss\n" "$i" "$elapsed"
  done
  
  if [ ${#times[@]} -eq 0 ]; then
    echo "  All runs failed!"
    echo "0" > "/tmp/benchmark_${name}.txt"
    return
  fi
  
  avg=$(printf '%s\n' "${times[@]}" | awk '{sum+=$1} END {printf "%.6f", sum/NR}')
  min=$(printf '%s\n' "${times[@]}" | sort -n | head -1)
  max=$(printf '%s\n' "${times[@]}" | sort -n | tail -1)
  avg_ms=$(awk "BEGIN {printf \"%.1f\", $avg * 1000}")
  
  echo ""
  echo "  Avg: ${avg}s (${avg_ms}ms) | Min: ${min}s | Max: ${max}s"
  echo ""
  
  echo "$avg" > "/tmp/benchmark_${name}.txt"
}

# Warmup
echo "Warming up..."
tb --cloud sql "SELECT 1" > /dev/null 2>&1
echo ""

# Create temp SQL files
mkdir -p /tmp/benchmark_sql

# Global Top 9 - billing_source
cat > /tmp/benchmark_sql/global_billing.sql << 'EOSQL'
WITH top_groups AS (
    SELECT groupArray(9)(group_value) as top_groups
    FROM (
        SELECT 
            properties.billing_source::String as group_value,
            sum(total_value) as total
        FROM events_hourly_mv
        WHERE
            org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
            AND env = 'live'
            AND event_name = 'usd_api_credits'
            AND hour >= toDateTime('2024-01-01 00:00:00')
            AND hour <= toDateTime('2025-12-31 23:59:59')
        GROUP BY group_value
        ORDER BY total DESC
    )
),
max_per_bin AS (
    SELECT max(bin_unique_count) > 9 as any_bin_truncated
    FROM (
        SELECT 
            formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
            count(DISTINCT properties.billing_source::String) as bin_unique_count
        FROM events_hourly_mv
        WHERE
            org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
            AND env = 'live'
            AND event_name = 'usd_api_credits'
            AND hour >= toDateTime('2024-01-01 00:00:00')
            AND hour <= toDateTime('2025-12-31 23:59:59')
        GROUP BY period
    )
)
SELECT
    formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
    event_name,
    if(
        has((SELECT top_groups FROM top_groups), properties.billing_source::String),
        properties.billing_source::String,
        'Other'
    ) as group_value,
    sum(total_value) as total_value,
    (SELECT any_bin_truncated FROM max_per_bin) as _truncated
FROM events_hourly_mv
WHERE
    org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
    AND env = 'live'
    AND event_name = 'usd_api_credits'
    AND hour >= toDateTime('2024-01-01 00:00:00')
    AND hour <= toDateTime('2025-12-31 23:59:59')
GROUP BY period, event_name, group_value
ORDER BY period, event_name, group_value
EOSQL

# Per-Bin Top 9 - billing_source
cat > /tmp/benchmark_sql/perbin_billing.sql << 'EOSQL'
WITH base AS (
    SELECT
        formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
        event_name,
        properties.billing_source::String as group_value,
        sum(total_value) as total_value
    FROM events_hourly_mv
    WHERE
        org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
        AND env = 'live'
        AND event_name = 'usd_api_credits'
        AND hour >= toDateTime('2024-01-01 00:00:00')
        AND hour <= toDateTime('2025-12-31 23:59:59')
    GROUP BY period, event_name, group_value
),
ranked AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY period, event_name ORDER BY total_value DESC) as rn
    FROM base
)
SELECT
    period,
    event_name,
    if(rn <= 9, group_value, 'Other') as group_value,
    sum(total_value) as total_value,
    max(rn) > 9 as _truncated
FROM ranked
GROUP BY period, event_name, group_value
ORDER BY period, event_name, group_value
EOSQL

# Global Top 9 - session_id
cat > /tmp/benchmark_sql/global_session.sql << 'EOSQL'
WITH top_groups AS (
    SELECT groupArray(9)(group_value) as top_groups
    FROM (
        SELECT 
            properties.session_id::String as group_value,
            sum(total_value) as total
        FROM events_hourly_mv
        WHERE
            org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
            AND env = 'live'
            AND event_name = 'usd_api_credits'
            AND hour >= toDateTime('2024-01-01 00:00:00')
            AND hour <= toDateTime('2025-12-31 23:59:59')
        GROUP BY group_value
        ORDER BY total DESC
    )
),
max_per_bin AS (
    SELECT max(bin_unique_count) > 9 as any_bin_truncated
    FROM (
        SELECT 
            formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
            count(DISTINCT properties.session_id::String) as bin_unique_count
        FROM events_hourly_mv
        WHERE
            org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
            AND env = 'live'
            AND event_name = 'usd_api_credits'
            AND hour >= toDateTime('2024-01-01 00:00:00')
            AND hour <= toDateTime('2025-12-31 23:59:59')
        GROUP BY period
    )
)
SELECT
    formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
    event_name,
    if(
        has((SELECT top_groups FROM top_groups), properties.session_id::String),
        properties.session_id::String,
        'Other'
    ) as group_value,
    sum(total_value) as total_value,
    (SELECT any_bin_truncated FROM max_per_bin) as _truncated
FROM events_hourly_mv
WHERE
    org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
    AND env = 'live'
    AND event_name = 'usd_api_credits'
    AND hour >= toDateTime('2024-01-01 00:00:00')
    AND hour <= toDateTime('2025-12-31 23:59:59')
GROUP BY period, event_name, group_value
ORDER BY period, event_name, group_value
EOSQL

# Per-Bin Top 9 - session_id
cat > /tmp/benchmark_sql/perbin_session.sql << 'EOSQL'
WITH base AS (
    SELECT
        formatDateTime(toStartOfDay(hour, 'UTC'), '%F %T') as period,
        event_name,
        properties.session_id::String as group_value,
        sum(total_value) as total_value
    FROM events_hourly_mv
    WHERE
        org_id = '0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx'
        AND env = 'live'
        AND event_name = 'usd_api_credits'
        AND hour >= toDateTime('2024-01-01 00:00:00')
        AND hour <= toDateTime('2025-12-31 23:59:59')
    GROUP BY period, event_name, group_value
),
ranked AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY period, event_name ORDER BY total_value DESC) as rn
    FROM base
)
SELECT
    period,
    event_name,
    if(rn <= 9, group_value, 'Other') as group_value,
    sum(total_value) as total_value,
    max(rn) > 9 as _truncated
FROM ranked
GROUP BY period, event_name, group_value
ORDER BY period, event_name, group_value
EOSQL

echo "==========================================="
echo "=== LOW CARDINALITY: billing_source ==="
echo "==========================================="
echo ""

run_benchmark "global_billing" /tmp/benchmark_sql/global_billing.sql
run_benchmark "perbin_billing" /tmp/benchmark_sql/perbin_billing.sql

echo "==========================================="
echo "=== HIGH CARDINALITY: session_id ==="
echo "==========================================="
echo ""

run_benchmark "global_session" /tmp/benchmark_sql/global_session.sql
run_benchmark "perbin_session" /tmp/benchmark_sql/perbin_session.sql

echo "==========================================="
echo "=== SUMMARY ==="
echo "==========================================="
echo ""

# Read results
t_global_billing=$(cat /tmp/benchmark_global_billing.txt 2>/dev/null || echo "0")
t_perbin_billing=$(cat /tmp/benchmark_perbin_billing.txt 2>/dev/null || echo "0")
t_global_session=$(cat /tmp/benchmark_global_session.txt 2>/dev/null || echo "0")
t_perbin_session=$(cat /tmp/benchmark_perbin_session.txt 2>/dev/null || echo "0")

ms_global_billing=$(awk "BEGIN {printf \"%.1f\", $t_global_billing * 1000}")
ms_perbin_billing=$(awk "BEGIN {printf \"%.1f\", $t_perbin_billing * 1000}")
ms_global_session=$(awk "BEGIN {printf \"%.1f\", $t_global_session * 1000}")
ms_perbin_session=$(awk "BEGIN {printf \"%.1f\", $t_perbin_session * 1000}")

echo "LOW CARDINALITY (billing_source):"
echo "  Global Top 9:   ${ms_global_billing}ms"
echo "  Per-Bin Top 9:  ${ms_perbin_billing}ms"
if awk "BEGIN {exit !($t_global_billing > 0 && $t_perbin_billing > 0)}"; then
  ratio_billing=$(awk "BEGIN {printf \"%.2f\", $t_global_billing / $t_perbin_billing}")
  pct_faster=$(awk "BEGIN {printf \"%.0f\", ($t_global_billing - $t_perbin_billing) / $t_global_billing * 100}")
  if [ "$pct_faster" -gt 0 ]; then
    echo "  Winner:         Per-Bin is ${ratio_billing}x faster (${pct_faster}% improvement)"
  else
    pct_slower=$(awk "BEGIN {printf \"%.0f\", ($t_perbin_billing - $t_global_billing) / $t_global_billing * 100}")
    echo "  Winner:         Global is faster (per-bin ${pct_slower}% slower)"
  fi
fi
echo ""

echo "HIGH CARDINALITY (session_id):"
echo "  Global Top 9:   ${ms_global_session}ms"
echo "  Per-Bin Top 9:  ${ms_perbin_session}ms"
if awk "BEGIN {exit !($t_global_session > 0 && $t_perbin_session > 0)}"; then
  ratio_session=$(awk "BEGIN {printf \"%.2f\", $t_global_session / $t_perbin_session}")
  pct_faster=$(awk "BEGIN {printf \"%.0f\", ($t_global_session - $t_perbin_session) / $t_global_session * 100}")
  if [ "$pct_faster" -gt 0 ]; then
    echo "  Winner:         Per-Bin is ${ratio_session}x faster (${pct_faster}% improvement)"
  else
    pct_slower=$(awk "BEGIN {printf \"%.0f\", ($t_perbin_session - $t_global_session) / $t_global_session * 100}")
    echo "  Winner:         Global is faster (per-bin ${pct_slower}% slower)"
  fi
fi
echo ""

# Cleanup
rm -f /tmp/benchmark_*.txt
rm -rf /tmp/benchmark_sql

echo "=== Done ==="
