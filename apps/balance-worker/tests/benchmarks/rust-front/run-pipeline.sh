#!/usr/bin/env bash
# One closed-loop run of today's Bun worker (serveBaseline) against the local broker.
# Env: CONNS (200), SECS (15), WARMUP (5), SPIKE_COMMIT_MODE, SPIKE_PIPELINE_DEPTH, SPIKE_LINGER_MS,
#      SPIKE_MAX_BATCH, CPU_BUN (2,3), CPU_LOAD (0,1), LABEL. Prints one JSON line (loadgen + appendStats).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
conns=${CONNS:-200}; secs=${SECS:-15}; warmup=${WARMUP:-5}
cpu_bun=${CPU_BUN:-2,3}; cpu_load=${CPU_LOAD:-0,1}
port=${SPIKE_PORT:-8091}
label=${LABEL:-"${SPIKE_COMMIT_MODE:-transactional}-d${SPIKE_PIPELINE_DEPTH:-1}-c$conns"}
topic="bw-spike-$(date +%s)-$RANDOM"
export SPIKE_TOPIC=$topic SPIKE_PORT=$port SPIKE_APPENDER=${SPIKE_APPENDER:-kafkajs} NODE_ENV=production
bun "$here/setupTopic.ts" "$topic" 2>/dev/null || { echo "topic setup failed" >&2; exit 1; }
out=$(mktemp)
taskset -c "$cpu_bun" bun "$here/serveBaseline.ts" >"$out" 2>"$out.err" &
bun_pid=$!
for _ in $(seq 100); do curl -sf -o /dev/null "http://127.0.0.1:$port/health" 2>/dev/null && break; sleep 0.1; done
sleep 0.5
line=$(taskset -c "$cpu_load" "$here/rust/target/release/bw-loadgen" load --addr "127.0.0.1:$port" \
  --conns "$conns" --warmup "$warmup" --secs "$secs" --label "$label" \
  --template "$here/track-template.json" --pids "bun=$bun_pid" --threads 2)
kill -TERM "$bun_pid" 2>/dev/null; wait "$bun_pid" 2>/dev/null
stats=$(rg -o '\{"appendStats".*\}' "$out" | tail -1)
python3 - "$line" "$stats" <<'PY'
import json,sys
a=json.loads(sys.argv[1]); b=json.loads(sys.argv[2]) if sys.argv[2] else {}
a.update(b); print(json.dumps(a))
PY
rm -f "$out" "$out.err"
