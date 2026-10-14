#!/usr/bin/env bash
# Bench only: interleaved A/B of the plumbing arms on the stages bench, one JSON line per run.
# Usage: apps/atom/tests/bench/plumbingAB.sh <results-dir>   (from a checkout that has the arm commits fetched)
# Env: ROUNDS (3), SECONDS_PER_RUN (20), CASES ("simple:1500 complex:1500").
set -euo pipefail

OUT=${1:?results dir}
ROUNDS=${ROUNDS:-3}
SECONDS_PER_RUN=${SECONDS_PER_RUN:-20}
CASES=${CASES:-"simple:1500 complex:1500"}
REPO=$(git rev-parse --show-toplevel)
mkdir -p "$OUT"
# Arms check out commits without this file, so it runs from a copy.
if [ -z "${PLUMBING_AB_COPY:-}" ]; then
	cp "$0" "$OUT/runner.sh"
	PLUMBING_AB_COPY=1 exec bash "$OUT/runner.sh" "$@"
fi

# name:commit:env
ARMS=(
	"base:b7468ffc73:"
	"nohono:b7468ffc73:BENCH_FAST_CHECK=1"
	"vmemo:8c8685db6d:"
	"token:87727ebf9f:"
	"decimal:2f91e63b03:"
	"noclock:67be2a7804:"
)

if ! command -v bun >/dev/null || [ "$(bun --version)" != "1.4.2" ]; then
	curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2" >/dev/null
	export PATH="$HOME/.bun/bin:$PATH"
fi
bun --version | tee "$OUT/machine.txt"
{ uname -a; nproc; lscpu | head -20; } >>"$OUT/machine.txt"
cd "$REPO"
git checkout -q b7468ffc73
bun install --frozen-lockfile >/dev/null

# The native floor once: Bun.serve alone, + body, + the full Hono chain, engine stubbed.
cd "$REPO/apps/atom"
for variant in bare bareBody atom atomMinimal; do
	bun run bench:plumbing "$variant" 2000 8 2>/dev/null | tail -1 >>"$OUT/plumbing.jsonl"
done

for round in $(seq 1 "$ROUNDS"); do
	for case in $CASES; do
		shape=${case%%:*}
		rate=${case##*:}
		for arm in $(printf '%s\n' "${ARMS[@]}" | shuf); do
			name=${arm%%:*}
			rest=${arm#*:}
			commit=${rest%%:*}
			envs=${rest#*:}
			git -C "$REPO" checkout -q "$commit"
			echo "== round=$round $shape $rate arm=$name ($commit)" >&2
			line=$(env $envs NODE_ENV=production bun --config=./bunfig.toml tests/bench/stagesBench.ts \
				"$rate" "$SECONDS_PER_RUN" "$shape" 1500 0.2 2>/dev/null | tail -1)
			echo "{\"arm\":\"$name\",\"commit\":\"$commit\",\"round\":$round,\"result\":$line}" >>"$OUT/stages.jsonl"
		done
	done
done
git -C "$REPO" checkout -q b7468ffc73
echo "done: $OUT" >&2
