#!/bin/bash
# Benchmark: JSON String MV vs JSON Type MV
# Runs each query multiple times and extracts server-side execution time

ORG_ID="0pCIbS4AMAFDB1iBMNhARWZt2gDtVwQx"
EVENT_NAME="usd_api_credits"
RUNS=10

echo "=== Benchmark: JSON String vs JSON Type MV ==="
echo "Org: $ORG_ID"
echo "Event: $EVENT_NAME"
echo "Runs: $RUNS"
echo ""

run_benchmark() {
  local name="$1"
  local query="$2"
  local times=()
  
  echo "--- $name ---"
  
  for i in $(seq 1 $RUNS); do
    elapsed=$(tb --cloud sql --stats "$query" 2>&1 | grep "Query took" | awk '{print $4}')
    times+=("$elapsed")
    printf "  Run %2d: %ss\n" "$i" "$elapsed"
  done
  
  avg=$(printf '%s\n' "${times[@]}" | awk '{sum+=$1} END {printf "%.6f", sum/NR}')
  min=$(printf '%s\n' "${times[@]}" | sort -n | head -1)
  max=$(printf '%s\n' "${times[@]}" | sort -n | tail -1)
  avg_ms=$(awk "BEGIN {printf \"%.1f\", $avg * 1000}")
  
  echo ""
  echo "  Avg: ${avg}s (${avg_ms}ms) | Min: ${min}s | Max: ${max}s"
  echo ""
  
  # Return avg for comparison
  echo "$avg" > "/tmp/benchmark_${name// /_}.txt"
}

# Warmup
echo "Warming up..."
tb --cloud sql "SELECT 1" > /dev/null 2>&1
echo ""

# JSON String MV
run_benchmark "json_string" "
  SELECT 
    JSONExtractString(properties, 'billing_source') as billing_source,
    JSONExtractString(properties, 'project_id') as project_id,
    sum(total_value) as total_value,
    sum(event_count) as event_count
  FROM events_hourly_exp_json_string_mv
  WHERE org_id = '$ORG_ID'
    AND event_name = '$EVENT_NAME'
  GROUP BY billing_source, project_id
  ORDER BY total_value DESC
"

# JSON Type MV (::String cast)
run_benchmark "json_cast" "
  SELECT 
    properties.billing_source::String as billing_source,
    properties.project_id::String as project_id,
    sum(total_value) as total_value,
    sum(event_count) as event_count
  FROM events_hourly_exp_json_mv
  WHERE org_id = '$ORG_ID'
    AND event_name = '$EVENT_NAME'
  GROUP BY billing_source, project_id
  ORDER BY total_value DESC
"

# JSON Type MV (.:String subcolumn)
run_benchmark "json_subcolumn" "
  SELECT 
    properties.billing_source.:String as billing_source,
    properties.project_id.:String as project_id,
    sum(total_value) as total_value,
    sum(event_count) as event_count
  FROM events_hourly_exp_json_mv
  WHERE org_id = '$ORG_ID'
    AND event_name = '$EVENT_NAME'
  GROUP BY billing_source, project_id
  ORDER BY total_value DESC
"

# JSON Type MV (toString - handles all types)
run_benchmark "json_tostring" "
  SELECT 
    toString(properties.billing_source) as billing_source,
    toString(properties.project_id) as project_id,
    sum(total_value) as total_value,
    sum(event_count) as event_count
  FROM events_hourly_exp_json_mv
  WHERE org_id = '$ORG_ID'
    AND event_name = '$EVENT_NAME'
  GROUP BY billing_source, project_id
  ORDER BY total_value DESC
"

echo "==========================================="
echo "=== Summary ==="
echo ""

# Read results
t_string=$(cat /tmp/benchmark_json_string.txt)
t_cast=$(cat /tmp/benchmark_json_cast.txt)
t_subcolumn=$(cat /tmp/benchmark_json_subcolumn.txt)
t_tostring=$(cat /tmp/benchmark_json_tostring.txt)

ms_string=$(awk "BEGIN {printf \"%.1f\", $t_string * 1000}")
ms_cast=$(awk "BEGIN {printf \"%.1f\", $t_cast * 1000}")
ms_subcolumn=$(awk "BEGIN {printf \"%.1f\", $t_subcolumn * 1000}")
ms_tostring=$(awk "BEGIN {printf \"%.1f\", $t_tostring * 1000}")

echo "Results (avg query time):"
echo "  1. JSON String (JSONExtractString):  ${ms_string}ms"
echo "  2. JSON Type (::String cast):        ${ms_cast}ms"
echo "  3. JSON Type (.:String subcolumn):   ${ms_subcolumn}ms"
echo "  4. JSON Type (toString):             ${ms_tostring}ms"
echo ""

# Find fastest
fastest_time=$t_cast
fastest_name="JSON Type (::String cast)"
fastest_ms=$ms_cast

if awk "BEGIN {exit !($t_subcolumn < $fastest_time)}"; then
  fastest_time=$t_subcolumn
  fastest_name="JSON Type (.:String subcolumn)"
  fastest_ms=$ms_subcolumn
fi
if awk "BEGIN {exit !($t_tostring < $fastest_time)}"; then
  fastest_time=$t_tostring
  fastest_name="JSON Type (toString)"
  fastest_ms=$ms_tostring
fi
if awk "BEGIN {exit !($t_string < $fastest_time)}"; then
  fastest_time=$t_string
  fastest_name="JSON String (JSONExtractString)"
  fastest_ms=$ms_string
fi

echo "Winner: $fastest_name (${fastest_ms}ms)"
echo ""
echo "Comparisons:"

ratio_string=$(awk "BEGIN {printf \"%.1f\", $t_string / $fastest_time}")
ratio_cast=$(awk "BEGIN {printf \"%.1f\", $t_cast / $fastest_time}")
ratio_subcolumn=$(awk "BEGIN {printf \"%.1f\", $t_subcolumn / $fastest_time}")
ratio_tostring=$(awk "BEGIN {printf \"%.1f\", $t_tostring / $fastest_time}")

echo "  $fastest_name is:"
echo "    ${ratio_string}x faster than JSON String (JSONExtractString)"
echo "    ${ratio_cast}x faster than JSON Type (::String cast)"
echo "    ${ratio_subcolumn}x faster than JSON Type (.:String subcolumn)"
echo "    ${ratio_tostring}x faster than JSON Type (toString)"

# Cleanup
rm -f /tmp/benchmark_json_*.txt

echo ""
echo "=== Done ==="
