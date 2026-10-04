#!/usr/bin/env bash
# The matrix: baseline (a) vs the serial-decide pipeline at several core counts and depths, alternated so
# drift lands on both sides. One JSON line per run appended to $OUT.
#   OUT=results.jsonl REPS=2 LEVELS="200 950" CORESETS="3|2,3|0,1,2,3" ./matrix.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
reps=${REPS:-2}
levels=${LEVELS:-"200 950"}
coresets=${CORESETS:-"3|2,3"}
secs=${SECS:-10}
warmup=${WARMUP:-4}
run() { # label mode cpus conns env...
	local label=$1 mode=$2 cpus=$3 conns=$4
	shift 4
	local line
	line=$(env "$@" MODE="$mode" CPUS="$cpus" CONNS="$conns" SECS="$secs" WARMUP="$warmup" LABEL="$label" "$here/run.sh" 2>/dev/null | tail -1)
	echo "$line" | tee -a "$out"
	sleep 1
}
IFS='|' read -ra sets <<<"$coresets"
for rep in $(seq "$reps"); do
	for cpus in "${sets[@]}"; do
		ncpu=$(echo "$cpus" | tr ',' '\n' | wc -l)
		# Load generator and broker share the cores the worker does not use; at 4 cores everything shares.
		if [ "$ncpu" -ge 4 ]; then lg="0,1,2,3"; else lg="0,1"; fi
		io=${IO_WORKERS_OVERRIDE:-$(( ncpu >= 4 ? 2 : (ncpu >= 2 ? 2 : 1) ))}
		for c in $levels; do
			run "a-v$ncpu-c$c-r$rep" a "$cpus" "$c" LOADGEN_CPUS="$lg"
			run "lean-v$ncpu-io$io-c$c-r$rep" serial "$cpus" "$c" LOADGEN_CPUS="$lg" CORE=lean IO_WORKERS="$io"
			if [ "${WITH_PROCESSOR:-0}" = "1" ]; then
				run "proc-v$ncpu-io$io-c$c-r$rep" serial "$cpus" "$c" LOADGEN_CPUS="$lg" CORE=processor IO_WORKERS="$io"
			fi
		done
	done
done
