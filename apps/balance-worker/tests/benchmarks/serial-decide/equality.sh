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

# Tracks, then checks (decided fresh, then from the memo), then tracks that move the balance, then checks again:
# the second check pass is where a stale memo or a hot/classic drift would show. EQ_CHECKS=0 keeps tracks only.
seq_run() { # label out
	local label=$1 file=$2
	for _ in $(seq 1 200); do ss -ltn | grep -q ":$port " && break; sleep 0.1; done
	if [ "${EQ_CHECKS:-1}" = "1" ]; then
		local half=$((count / 2))
		taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/track --count "$half" --template "$rf/track-template.json" --out "$file.t1" --prefix eq
		taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/check --count "$half" --template "$rf/check-template.json" --out "$file.c1" --prefix eqc
		taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/track --count "$((count - half))" --template "$rf/track-template.json" --out "$file.t2" --prefix eq2
		taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/check --count "$half" --template "$rf/check-template.json" --out "$file.c2" --prefix eqc2
		cat "$file.t1" "$file.c1" "$file.t2" "$file.c2" >"$file"
	else
		taskset -c 0,1 "$loadgen" seq --addr 127.0.0.1:$port --path /v1/track --count "$count" --template "$rf/track-template.json" --out "$file" --prefix eq
	fi
}

if [ "${EQ_MODE:-lean}" = "arm" ]; then
	# Both sides through the production arms: A against ARM (default D), same harness, same fixtures.
	ARM=A SPIKE_TOPIC="eq-a-$stamp" SPIKE_PORT=$port SPIKE_LOG_RATE=0 IO_WORKERS=2 \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/serial-decide/serveArm.ts" >"$out/a.log" 2>&1 </dev/null &
else
SPIKE_TOPIC="eq-a-$stamp" SPIKE_PORT=$port SPIKE_APPENDER=kafkajs SPIKE_LOG_RATE=0 \
	setsid taskset -c 2,3 bun "$bw/tests/benchmarks/rust-front/serveBaseline.ts" >"$out/a.log" 2>&1 </dev/null &
fi
seq_run a "$out/a.bin"
kill "$(ss -ltnp | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
for _ in $(seq 1 50); do ss -ltn | grep -q ":$port " || break; sleep 0.1; done

if [ "${EQ_MODE:-lean}" = "arm" ]; then
	ARM=${ARM:-D} SPIKE_TOPIC="eq-lean-$stamp" SPIKE_PORT=$port SPIKE_LOG_RATE=0 IO_WORKERS=2 \
		setsid taskset -c 2,3 bun "$bw/tests/benchmarks/serial-decide/serveArm.ts" >"$out/lean.log" 2>&1 </dev/null &
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

if [ "${EQ_CHECKS:-1}" = "1" ]; then
	for pass in t1 c1 t2 c2; do
		cmp "$out/a.bin.$pass" "$out/lean.bin.$pass" && echo "replies ($pass): identical ($(stat -c %s "$out/a.bin.$pass") bytes incl. status/length framing)"
	done
	echo "replies: $count tracks + $count checks identical"
else
	cmp "$out/a.bin" "$out/lean.bin" && echo "replies: $count identical ($(stat -c %s "$out/a.bin") bytes incl. status/length framing)"
fi
(cd "$bw" && env -u SPIKE_FIXED_CLOCK bun "$rf/compareTopics.ts" "eq-a-$stamp" "eq-lean-$stamp" $((count + 1)))
