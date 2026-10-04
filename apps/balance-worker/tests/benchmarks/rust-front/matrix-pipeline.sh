#!/usr/bin/env bash
# Commit-pipeline matrix: transactional vs idempotent, stop-and-wait vs pipelined, at several in-flight levels.
# One JSON line per run in $OUT; configurations alternate within each rep so drift lands on all of them.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
reps=${REPS:-2}
levels=${LEVELS:-"200 800"}
run() { # label mode depth conns [extra env...]
  local label=$1 mode=$2 depth=$3 conns=$4; shift 4
  local line
  line=$(env "$@" SPIKE_COMMIT_MODE="$mode" SPIKE_PIPELINE_DEPTH="$depth" CONNS="$conns" LABEL="$label" "$here/run-pipeline.sh" 2>/dev/null | tail -1)
  echo "$line" | tee -a "$out"
  sleep 2
}
for rep in $(seq "$reps"); do
  for c in $levels; do
    run "txn-d1-c$c-r$rep" transactional 1 "$c"
    run "idem-d1-c$c-r$rep" idempotent 1 "$c"
    run "idem-d2-c$c-r$rep" idempotent 2 "$c"
    run "idem-d4-c$c-r$rep" idempotent 4 "$c"
  done
done
