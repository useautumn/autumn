#!/usr/bin/env bash
# One measured run of the ring-stack bench: boots serveRingStack.ts on CPUS, drives it from LOADGEN_CPUS with the
# Rust loadgen replaying MIX at RATE (paced) and prints one JSON line: throughput, latency, per-class counts and the
# worker's CPU µs per request (process and decide thread).
#   LOADGEN=… MIX=… RATE=3000 INLINE=on|off CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=1500 SECS=8 WARMUP=3 LABEL=x ./run.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bun=${BUN:-bun}
loadgen=${LOADGEN:?path to bw-loadgen}
template=${TEMPLATE:-$(dirname "$loadgen")/../../../track-template.json}
port=${PORT:-8093}
log=${LOG:-/tmp/ring-bench-$$.log}
if ss -ltn 2>/dev/null | grep -q ":$port "; then
	echo "port $port is already in use" >&2
	exit 1
fi
NODE_ENV=production PORT=$port INLINE=${INLINE:-on} HTTP_WORKERS=${HTTP_WORKERS:-1} \
	setsid taskset -c "${CPUS:-2,3}" "$bun" "$here/serveRingStack.ts" >"$log" 2>&1 </dev/null &
pid=$!
for _ in $(seq 1 600); do
	grep -q "^listening" "$log" 2>/dev/null && break
	sleep 0.1
done
if ! grep -q "^listening" "$log"; then
	echo "worker did not start:" >&2
	tail -20 "$log" >&2
	kill "$pid" 2>/dev/null
	exit 1
fi
sleep 0.5
server_pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
server_pid=${server_pid:-$pid}
result=$(taskset -c "${LOADGEN_CPUS:-0,1}" "$loadgen" load --addr "127.0.0.1:$port" --path /v1/track \
	--conns "${CONNS:-1500}" --warmup "${WARMUP:-3}" --secs "${SECS:-8}" --threads 2 --template "$template" \
	--pids "worker=$server_pid" --label "${LABEL:-run}" --mix "${MIX:?}" ${RATE:+--rate "$RATE"} 2>"$log.loadgen")
kill -TERM "$server_pid" 2>/dev/null
for _ in $(seq 1 50); do
	ss -ltn 2>/dev/null | grep -q ":$port " || break
	sleep 0.1
done
kill -KILL "$server_pid" 2>/dev/null
echo "$result" | "$bun" -e '
const r = JSON.parse(await Bun.stdin.text());
const w = r.procs?.worker ?? {};
console.log(JSON.stringify({
  label: r.label, rate: r.rate ?? null, perSec: r.tracksPerSec, errors: r.errors, windowErrors: r.windowErrors,
  p50Ms: r.p50Ms, p99Ms: r.p99Ms, byClass: r.byClass,
  processUsPerReq: w.cpuUsPerTrack, decideThreadUsPerReq: w.mainThreadUsPerTrack, processUtil: w.cpuUtil,
}));
'
