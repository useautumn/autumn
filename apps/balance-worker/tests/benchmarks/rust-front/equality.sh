#!/usr/bin/env bash
# Byte-equality: the same sequential requests through today's worker (kafkajs) and the Rust front (rdkafka)
# must give identical HTTP reply bodies and identical Kafka records (key, value, headers).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
worker=$(cd "$here/../../.." && pwd)
out=${EQ_OUT:-$HOME/.capy/work/rf-results/equality}
count=${SEQ_COUNT:-200}
mkdir -p "$out"
stamp=$(date +%s)
export SPIKE_FIXED_CLOCK=${SPIKE_FIXED_CLOCK:-1700000000000}
(cd "$worker" && NODE_ENV=production bun --config=./bunfig.toml "$here/setupTopic.ts" "eq-a-$stamp" && NODE_ENV=production bun --config=./bunfig.toml "$here/setupTopic.ts" "eq-b-$stamp")
SPIKE_TOPIC="eq-a-$stamp" SEQ_OUT="$out/a.bin" SEQ_COUNT=$count SEQ_PREFIX="eq" LABEL=eq-a "$here/run.sh" a
SPIKE_TOPIC="eq-b-$stamp" SEQ_OUT="$out/b.bin" SEQ_COUNT=$count SEQ_PREFIX="eq" LABEL=eq-b "$here/run.sh" b-kafka
cmp "$out/a.bin" "$out/b.bin" && echo "replies: $count identical ($(stat -c %s "$out/a.bin") bytes incl. status/length framing)"
(cd "$worker" && env -u SPIKE_FIXED_CLOCK NODE_ENV=production bun --config=./bunfig.toml "$here/compareTopics.ts" "eq-a-$stamp" "eq-b-$stamp" $((count + 1)))
