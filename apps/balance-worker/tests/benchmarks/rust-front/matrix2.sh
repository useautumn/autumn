#!/usr/bin/env bash
# Second matrix: the Rust front with Bun free on both vCPUs (GC helpers keep their thread), step 1 and step 2, to saturation.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
run() { local label=$1 mode=$2; shift 2; env "$@" LABEL="$label" "$here/run.sh" "$mode" 2>/dev/null | tail -1 | tee -a "$out"; sleep 2; }
for rep in $(seq "${REPS:-2}"); do
  for c in ${LEVELS:-"200 800 1600"}; do
    run "a-c$c-r$rep" a CONNS=$c APPENDER=kafkajs
    run "b-shared-c$c-r$rep" b CONNS=$c APPENDER=kafkajs CPU_FRONT=2 CPU_CORE=2,3
    run "bk-shared-c$c-r$rep" b-kafka CONNS=$c CPU_FRONT=2 CPU_CORE=2,3
  done
done
