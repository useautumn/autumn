#!/usr/bin/env bash
# Self-hosted sqld write-ceiling sweep on one box; posts summaries to $RESULT_URL. Harness tarball sits at $HARNESS_TGZ.
set -uo pipefail
export HOME="${HOME:-/root}" PATH="$HOME/.bun/bin:$PATH"
WORK="${WORK:-/opt/spike}"
SQLD_BIN="${SQLD_BIN:-$WORK/sqld}"
post() { curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary "$1" "$RESULT_URL" >/dev/null || true; }
mkdir -p "$WORK/h" && cd "$WORK"

if [ ! -x "$SQLD_BIN" ]; then
	arch=$(uname -m); [ "$arch" = arm64 ] && arch=aarch64
	curl -sSfL "https://github.com/tursodatabase/libsql/releases/download/libsql-server-v0.24.32/libsql-server-${arch}-unknown-linux-gnu.tar.xz" | tar xJ
	SQLD_BIN=$(find "$WORK" -name sqld -type f | head -1)
fi
command -v bun >/dev/null || (curl -fsSL https://bun.sh/install | bash) >/dev/null 2>&1
tar xzf "$HARNESS_TGZ" -C "$WORK/h" && cd "$WORK/h" && bun install >/dev/null 2>&1
post "{\"stage\":\"booted\",\"host\":\"$(hostname)\",\"cpus\":$(nproc),\"arch\":\"$(uname -m)\",\"sqld\":\"$($SQLD_BIN --version 2>&1 | head -1)\"}"

scenario() { # name readers inflight rows
	cat <<EOF
{"name":"$1","db":"local","engine":"er","readers":$2,"seconds":${SECS_TOTAL:-32},"pollMs":0,"warmupS":3,
 "writer":{"ratePerSec":1000000,"rowsPerRequest":$4,"maxInFlight":$3,"keys":200000,"bytes":6000,"seconds":${SECS_WRITE:-20}},"pointReads":300}
EOF
}

for spec in "c1-rows1 0 1 1" "c1-rows50 0 1 50" "c2-rows50 0 2 50" "c4-rows50 0 4 50" "c1-rows100 0 1 100" "c2-rows100 0 2 100" "c2-rows50-4rep 4 2 50" "c2-rows100-4rep 4 2 100"; do
	set -- $spec
	pkill -f "$SQLD_BIN" ; sleep 1; rm -rf "$WORK/data.sqld"
	"$SQLD_BIN" --db-path "$WORK/data.sqld" --http-listen-addr 127.0.0.1:8080 --grpc-listen-addr 127.0.0.1:5001 >"$WORK/sqld-$1.log" 2>&1 &
	sleep 2
	scenario "$1" "$2" "$3" "$4" >"/tmp/$1.json"
	( while sleep 2; do top -bn1 | awk -v n="$1" '/sqld/ {print n, $9}' ; done ) >"$WORK/cpu-$1.txt" &
	mon=$!
	SPIKE_URL=http://127.0.0.1:8080 SPIKE_OUT="$WORK/runs" timeout 150 bun run.ts "/tmp/$1.json" >"$WORK/run-$1.log" 2>&1
	rc=$?; kill $mon 2>/dev/null
	summary=$(ls -t "$WORK"/runs/"$1"-*/summary.json 2>/dev/null | head -1)
	cpu=$(awk '{s+=$2; if($2>m)m=$2; n++} END {printf "{\"avg\":%.0f,\"max\":%.0f}", (n?s/n:0), m}' "$WORK/cpu-$1.txt")
	if [ -n "$summary" ]; then
		post "$(python3 -c "import json,sys;s=json.load(open('$summary'));s.pop('perReader',None) if not s['perReader'] else s.update(perReader=[{k:r[k] for k in ('reader','lagMs','seenPct','missingKeys','staleKeys','outOfOrder','errors')} for r in s['perReader']]);s['sqldCpuPct']=json.loads('$cpu');s['rc']=$rc;print(json.dumps(s))")"
	else
		post "{\"stage\":\"failed\",\"name\":\"$1\",\"rc\":$rc,\"tail\":$(tail -c 600 "$WORK/run-$1.log" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}"
	fi
done
pkill -f "$SQLD_BIN"
post '{"stage":"done"}'
