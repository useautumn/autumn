#!/usr/bin/env bash
# Usage: stressRun.sh <repo root> <label> [seconds]; concurrent ListOffsets on one admin while brokers are SIGKILLed and restarted.
root=$1; label=$2; secs=${3:-300}
CL=$(cd "$(dirname "$0")" && pwd)/chaosCluster.sh
out=${CHAOS_OUT:-$HOME/.capy/work/chaos}/$label
ulimit -c unlimited
cd "$root/packages/librdkafka" || exit 1
PROBE_BROKERS=$($CL direct) PROBE_TOPIC=${PROBE_TOPIC:-probe-stress} PROBE_SECONDS=$secs PROBE_METADATA_REFRESH_MS=${PROBE_METADATA_REFRESH_MS:-300000} bun scripts/stressAdminListOffsets.ts >"$out.log" 2>&1 &
pid=$!
kills=0; b=1
while kill -0 $pid 2>/dev/null; do
	sleep 5; kill -0 $pid 2>/dev/null || break
	$CL kill $b KILL >/dev/null; kills=$((kills+1)); sleep 15
	$CL start-node $b; $CL wait-node $b; sleep 10
	b=$(( b % 3 + 1 ))
done
wait $pid; rc=$?
for n in 1 2 3; do $CL start-node $n; done
echo "$label rc=$rc kills=$kills $(grep -E '^ok|double free|corruption|free\(\)' "$out.log" | tail -1)"
