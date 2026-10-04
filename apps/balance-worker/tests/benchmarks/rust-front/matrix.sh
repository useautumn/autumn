#!/usr/bin/env bash
# The report's matrix: today's worker vs the Rust front, pinned three ways, at 200 in flight and at saturation.
# Alternates configurations within each rep so drift lands on all of them. One JSON line per run in $OUT.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
reps=${REPS:-2}
levels=${LEVELS:-"200 800"}
run() { # label mode env...
  local label=$1 mode=$2; shift 2
  local line
  line=$(env "$@" LABEL="$label" "$here/run.sh" "$mode" 2>/dev/null | tail -1)
  echo "$line" | tee -a "$out"
  sleep 2
}
for rep in $(seq "$reps"); do
  for c in $levels; do
    run "a-c$c-r$rep" a CONNS=$c APPENDER=kafkajs
    run "b-strict-c$c-r$rep" b CONNS=$c APPENDER=kafkajs CPU_FRONT=2 CPU_CORE=3
    run "bk-strict-c$c-r$rep" b-kafka CONNS=$c CPU_FRONT=2 CPU_CORE=3
    run "bk-shared-c$c-r$rep" b-kafka CONNS=$c CPU_FRONT=2 CPU_CORE=2,3
    run "bk-float-c$c-r$rep" b-kafka CONNS=$c CPU_FRONT=2,3 CPU_CORE=2,3
  done
done
