#!/usr/bin/env bash
# The report's matrix: today's worker (a) vs the serial-decide pipeline (lean; proc = today's processor on the
# sequencer thread) at 1–4 cores and two depths, the commit bound lifted (sim appender), per-role pinning, and a
# checks-only comparison. Alternates within each rep so drift lands on every side. One JSON line per run in $OUT.
#   OUT=results.jsonl REPS=2 ./matrix-final.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${OUT:?OUT}
reps=${REPS:-2}
export SECS=${SECS:-10} WARMUP=${WARMUP:-4}
run() { # label env...
	local label=$1
	shift
	local line
	line=$(env "$@" LABEL="$label" "$here/run.sh" 2>/dev/null | tail -1)
	echo "$line" | tee -a "$out"
	sleep 1
}
check_template="$here/../rust-front/check-template.json"
for rep in $(seq "$reps"); do
	# 1 vCPU: worker on core 3; load generator and broker on 0,1
	run "a-v1-c200-r$rep" MODE=a CPUS=3 LOADGEN_CPUS=0,1 CONNS=200
	run "lean-v1-io1-c200-r$rep" MODE=serial CORE=lean IO_WORKERS=1 CPUS=3 LOADGEN_CPUS=0,1 CONNS=200
	run "a-v1-c950-r$rep" MODE=a CPUS=3 LOADGEN_CPUS=0,1 CONNS=950
	run "lean-v1-io1-c950-r$rep" MODE=serial CORE=lean IO_WORKERS=1 CPUS=3 LOADGEN_CPUS=0,1 CONNS=950
	# 2 vCPU (both hyperthreads of one core, as ATMN-596)
	run "a-v2-c200-r$rep" MODE=a CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200
	run "lean-v2-io2-c200-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200
	run "a-v2-c950-r$rep" MODE=a CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=950
	run "lean-v2-io2-c950-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=950
	run "proc-v2-io2-c950-r$rep" MODE=serial CORE=processor IO_WORKERS=2 CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=950
	# 3 cores: worker on 1,2,3; load generator and broker share core 0
	run "a-v3-c950-r$rep" MODE=a CPUS=1,2,3 LOADGEN_CPUS=0 CONNS=950
	run "lean-v3-io2-c200-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=1,2,3 LOADGEN_CPUS=0 CONNS=200
	run "lean-v3-io2-c950-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=1,2,3 LOADGEN_CPUS=0 CONNS=950
	run "lean-v3-io2-c950-pinned-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=1,2,3 LOADGEN_CPUS=0 CONNS=950 PIN_SEQUENCER=3 PIN_KAFKA=1 PIN_IO0=2 PIN_IO1=2
	# 4 cores: everything (worker, load generator, broker) shares the machine
	run "a-v4-c950-r$rep" MODE=a CPUS=0,1,2,3 LOADGEN_CPUS=0,1,2,3 CONNS=950
	run "lean-v4-io2-c950-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=0,1,2,3 LOADGEN_CPUS=0,1,2,3 CONNS=950
	# Commit bound lifted: records are acknowledged the moment the Kafka worker takes them
	run "asim-v2-c200-r$rep" MODE=a APPENDER=sim CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200
	run "leansim-v2-io2-c200-r$rep" MODE=serial CORE=lean IO_WORKERS=2 APPENDER=sim CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200
	run "leansim-v3-io2-c950-r$rep" MODE=serial CORE=lean IO_WORKERS=2 APPENDER=sim CPUS=1,2,3 LOADGEN_CPUS=0 CONNS=950
	# Checks only (memo hits), 2 vCPU
	run "a-check-v2-c200-r$rep" MODE=a CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200 REQ_PATH=/v1/check TEMPLATE="$check_template"
	run "lean-check-v2-io2-c200-r$rep" MODE=serial CORE=lean IO_WORKERS=2 CPUS=2,3 LOADGEN_CPUS=0,1 CONNS=200 REQ_PATH=/v1/check TEMPLATE="$check_template"
done
