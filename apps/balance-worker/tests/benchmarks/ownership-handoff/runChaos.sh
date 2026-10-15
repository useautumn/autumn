#!/usr/bin/env bash
# Usage: runChaos.sh <label> [VAR=value...]; writes $CHAOS_OUT/<label>.{json,raw.json,log}
# Bootstraps through the stall proxies when CHAOS_FAULT=stall, directly otherwise.
set -u
label=$1
shift
here=$(cd "$(dirname "$0")" && pwd)
out=${CHAOS_OUT:-$HOME/.capy/work/chaos}
mkdir -p "$out"
cd "$here/../../.." || exit 1
DATABASE_URL=$(grep -E '^DATABASE_URL=' ../../server/.env.local | head -1 | cut -d= -f2- | tr -d '"')
mode=direct
for assignment in "$@"; do [ "$assignment" = CHAOS_FAULT=stall ] && mode=proxied; done
brokers=$("$here/chaosCluster.sh" "$mode")
env "$@" \
	DATABASE_URL="$DATABASE_URL" NODE_ENV=test KAFKA_AUTH_MODE=none \
	KAFKA_BROKERS="$brokers" CHAOS_LABEL="$label" BENCH_OUT_DIR="$out" \
	timeout -k 10 1200 bun tests/benchmarks/ownership-handoff/brokerChaos.ts >"$out/$label.log" 2>&1
status=$?
"$here/chaosCluster.sh" heal >/dev/null 2>&1
for n in 1 2 3; do "$here/chaosCluster.sh" start-node "$n" >/dev/null 2>&1; done
echo "exit $status"
exit $status
