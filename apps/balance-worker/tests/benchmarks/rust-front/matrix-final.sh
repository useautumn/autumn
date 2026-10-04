#!/usr/bin/env bash
# CPU ceiling (sim appender: encode only, no broker) vs stop-and-wait vs pipelined, idempotent, maxBatchSize 500.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
run() { # label appender depth conns
  local label=$1 appender=$2 depth=$3 conns=$4
  local line
  line=$(SPIKE_APPENDER="$appender" SPIKE_COMMIT_MODE=idempotent SPIKE_PIPELINE_DEPTH="$depth" SPIKE_MAX_BATCH=500 CONNS="$conns" LABEL="$label" "$here/run-pipeline.sh" 2>/dev/null | tail -1)
  echo "$line" | tee -a "$out"
  sleep 2
}
for rep in 1 2; do
  run "sim-c200-r$rep" sim 1 200
  run "idem-d1-c200-r$rep" kafkajs 1 200
  run "idem-d2-c200-r$rep" kafkajs 2 200
  run "idem-d4-c200-r$rep" kafkajs 4 200
done
run "sim-c800-r1" sim 1 800
run "idem-d1-c800-r1" kafkajs 1 800
run "idem-d2-c800-r1" kafkajs 2 800
