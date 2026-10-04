#!/usr/bin/env bash
# The dev/prod writer limit (maxBatchSize 100) vs the perf stack's 500, with and without an emulated 2 ms wire delay to the broker.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
run() { # label mode depth batch
  local label=$1 mode=$2 depth=$3 batch=$4
  local line
  line=$(SPIKE_COMMIT_MODE="$mode" SPIKE_PIPELINE_DEPTH="$depth" SPIKE_MAX_BATCH="$batch" CONNS=200 LABEL="$label" "$here/run-pipeline.sh" 2>/dev/null | tail -1)
  echo "$line" | tee -a "$out"
  sleep 2
}
run "b100-txn-d1" transactional 1 100
run "b100-idem-d1" idempotent 1 100
run "b100-idem-d2" idempotent 2 100
run "b100-idem-d4" idempotent 4 100
# 2 ms one-way delay on packets to the broker port: wire time the pipeline can hide, broker service time it cannot.
sudo tc qdisc add dev lo root handle 1: prio
sudo tc qdisc add dev lo parent 1:3 handle 30: netem delay 2ms
sudo tc filter add dev lo protocol ip parent 1:0 prio 3 u32 match ip dport 19092 0xffff flowid 1:3
run "wire2-b100-txn-d1" transactional 1 100
run "wire2-b100-idem-d1" idempotent 1 100
run "wire2-b100-idem-d2" idempotent 2 100
run "wire2-b100-idem-d4" idempotent 4 100
run "wire2-b500-txn-d1" transactional 1 500
run "wire2-b500-idem-d1" idempotent 1 500
run "wire2-b500-idem-d2" idempotent 2 500
run "wire2-b500-idem-d4" idempotent 4 500
sudo tc qdisc del dev lo root
