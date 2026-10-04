#!/usr/bin/env bash
# Byte-equality: the same sequential requests through today's worker (a) and the serial-decide pipeline (lean)
# must give identical HTTP reply bodies and identical Kafka records (key, value, headers). The clock is pinned.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bw=$(cd "$here/../../.." && pwd)
rf="$here/../rust-front"
loadgen="$rf/rust/target/release/bw-loadgen"
out=${EQ_OUT:-$HOME/.capy/work/atmn602/equality}
count=${SEQ_COUNT:-200}
mkdir -p "$out"
stamp=$(date +%s)
port=8093
export NODE_ENV=production SPIKE_FIXED_CLOCK=${SPIKE_FIXED_CLOCK:-1700000000000}
(cd "$bw" && bun "$rf/setupTopic.ts" "eq-a-$stamp" && bun "$rf/setupTopic.ts" "eq-lean-$stamp")

seq_run() { # label out
	local label=$1 file=$2
	for _ in $(seq 1 200); do ss -ltn | grep -q ":$port " && break; sleep 0.1; done
	taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/track --count "$count" --template "$rf/track-template.json" --out "$file" --prefix eq
}

SPIKE_TOPIC="eq-a-$stamp" SPIKE_PORT=$port SPIKE_APPENDER=kafkajs SPIKE_LOG_RATE=0 SPIKE_ENGINE_ALLOC_ARM=A SPIKE_ADAPTIVE_LINGER_ARM=A \
	setsid taskset -c 2,3 bun "$bw/tests/benchmarks/rust-front/serveBaseline.ts" >"$out/a.log" 2>&1 </dev/null &
seq_run a "$out/a.bin"
kill "$(ss -ltnp | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
for _ in $(seq 1 50); do ss -ltn | grep -q ":$port " || break; sleep 0.1; done

if [ "${EQ_MODE:-lean}" = "engine-arms" ]; then
	# Arm B of the engine-alloc experiment against arm A, both on today's worker.
	SPIKE_TOPIC="eq-lean-$stamp" SPIKE_PORT=$port SPIKE_APPENDER=kafkajs SPIKE_LOG_RATE=0 SPIKE_ENGINE_ALLOC_ARM=B SPIKE_ADAPTIVE_LINGER_ARM=A \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/rust-front/serveBaseline.ts" >"$out/lean.log" 2>&1 </dev/null &
elif [ "${EQ_MODE:-lean}" = "linger-arms" ]; then
	# Adaptive-linger arm B against arm A, both on today's worker: batching may differ, bytes may not.
	SPIKE_TOPIC="eq-lean-$stamp" SPIKE_PORT=$port SPIKE_APPENDER=kafkajs SPIKE_LOG_RATE=0 SPIKE_ENGINE_ALLOC_ARM=A SPIKE_ADAPTIVE_LINGER_ARM=B \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/rust-front/serveBaseline.ts" >"$out/lean.log" 2>&1 </dev/null &
elif [ "${EQ_MODE:-lean}" = "pool" ]; then
	SPIKE_TOPIC="eq-lean-$stamp" SPIKE_PORT=$port SPIKE_APPENDER=kafkajs SPIKE_LOG_RATE=0 IO_WORKERS=2 \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/serial-decide/servePool.ts" >"$out/lean.log" 2>&1 </dev/null &
else
	SPIKE_TOPIC="eq-lean-$stamp" PORT=$port IO_WORKERS=2 CORE=lean APPENDER=kafka LOG_RATE=0 \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/serial-decide/serve.ts" >"$out/lean.log" 2>&1 </dev/null &
fi
seq_run lean "$out/lean.bin"
kill "$(ss -ltnp | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
for _ in $(seq 1 50); do ss -ltn | grep -q ":$port " || break; sleep 0.1; done

cmp "$out/a.bin" "$out/lean.bin" && echo "replies: $count identical ($(stat -c %s "$out/a.bin") bytes incl. status/length framing)"
(cd "$bw" && env -u SPIKE_FIXED_CLOCK bun "$rf/compareTopics.ts" "eq-a-$stamp" "eq-lean-$stamp" $((count + 1)))
