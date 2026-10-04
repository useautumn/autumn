#!/usr/bin/env bash
# Alternates modes so drift lands on both sides; appends one JSON line per run to $OUT.
# Usage: OUT=results.jsonl REPS=2 ./series.sh "a:kafkajs" "b:kafkajs" "b-kafka:" ...
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
reps=${REPS:-2}
for rep in $(seq "$reps"); do
  for spec in "$@"; do
    mode=${spec%%:*}; appender=${spec#*:}
    label="${mode}-${appender:-remote}-c${CONNS:-200}-r$rep"
    line=$(APPENDER=$appender LABEL=$label "$here/run.sh" "$mode" | tail -1)
    echo "$line" | tee -a "$out"
    sleep 2
  done
done
