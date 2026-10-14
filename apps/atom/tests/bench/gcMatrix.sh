#!/usr/bin/env bash
# GC bench matrix: `gcMatrix.sh <outdir> [arm ...]`. One JSONL per arm, one line per cell, plus the raw GC logs.
# Arms are named BUN_JSC_* environments; `baseline` sets none. Run from apps/atom with Bun 1.4.2 on PATH.
set -u
out=$1; shift
mkdir -p "$out"
arms=("$@")
[ ${#arms[@]} -eq 0 ] && arms=(baseline markers1 markers4 growth2 mu09 noconcurrent incremental shortpause)
cells="${GC_CELLS:-0:500 0:1000 0:1500 0:2000 7000:500 7000:1000 7000:1500 7000:2000}"
seconds="${GC_SECONDS:-20}"
envOf() {
	case $1 in
	baseline) echo "" ;;
	markers1) echo "BUN_JSC_numberOfGCMarkers=1" ;;
	markers4) echo "BUN_JSC_numberOfGCMarkers=4" ;;
	growth2) echo "BUN_JSC_largeHeapGrowthFactor=2" ;;
	mu09) echo "BUN_JSC_maximumMutatorUtilization=0.9" ;;
	noconcurrent) echo "BUN_JSC_useConcurrentGC=false" ;;
	incremental) echo "BUN_JSC_gcIncrementScale=1" ;;
	shortpause) echo "BUN_JSC_minimumGCPauseMS=0.3 BUN_JSC_gcPauseScale=0.1" ;;
	pin1) echo "GC_TASKSET=0" ;;
	pin1-noconcurrent) echo "GC_TASKSET=0 BUN_JSC_useConcurrentGC=false" ;;
	pin1-markers1) echo "GC_TASKSET=0 BUN_JSC_numberOfGCMarkers=1" ;;
	pin1-growth2) echo "GC_TASKSET=0 BUN_JSC_largeHeapGrowthFactor=2" ;;
	pin2) echo "GC_TASKSET=0,1" ;;
	pin2-noconcurrent) echo "GC_TASKSET=0,1 BUN_JSC_useConcurrentGC=false" ;;
	*) echo "$1" ;;
	esac
}
{
	echo "bun $(bun --version) $(uname -m) $(nproc) cpus"
	BUN_JSC_dumpOptions=2 bun -e 1 2>&1 | grep -E "numberOfGCMarkers|largeHeapGrowthFactor|maximumMutatorUtilization|useConcurrentGC|gcIncrementScale|minimumGCPauseMS|gcPauseScale"
} >"$out/env.txt"
for arm in "${arms[@]}"; do
	jsonl="$out/$arm.jsonl"
	: >"$jsonl"
	for cell in $cells; do
		bg=${cell%%:*}
		rate=${cell##*:}
		bgRate=0
		[ "$bg" -gt 0 ] && bgRate=500
		# A replica a previous cell left behind would hold the ports.
		for pid in $(pgrep -f "bench/[g]cBench.ts replica" ; pgrep -f "bench/[m]ultiWorkerAutumn.ts"); do kill -9 "$pid" 2>/dev/null; done
		# shellcheck disable=SC2046
		env $(envOf "$arm") GC_LOG_PATH="$out/$arm-bg$bg-r$rate.gclog" timeout 300 bun run bench:gc "$rate" "$seconds" "$bg" "$bgRate" 2>/dev/null | tail -1 >>"$jsonl"
	done
done
echo done >"$out/DONE"
