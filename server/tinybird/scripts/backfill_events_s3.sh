#!/usr/bin/env bash
# Backfill onboarded enterprise customers' events into S3, via the export-optimized mirror.
#
#   ./backfill_events_s3.sh            # export events_by_org_ts → S3, parallel, rows-sized chunks
#   ./backfill_events_s3.sh --populate # base events → mirror (only for the BACKFILL-skip approach)
#   ./backfill_events_s3.sh --plan     # list the (org × month) units and exit
#
# Export design: the mirror is sorted (org_id, timestamp), so org+time reads are index-pruned.
# We scan per-(org,month) row counts, size each month into ~TARGET_ROWS chunks (a 60k month = 1
# chunk, an 800M month = ~100), and run chunks through a CONCURRENCY pool. Progress shows two
# ETAs off a rolling-EMA throughput: the current month's completion and the whole backfill.
# Resumable (per-chunk checkpoint, absolute windows) and idempotent (timestamp-keyed S3 paths).
set -uo pipefail

# Onboarded enterprise customers. Keep in sync with events_sink_s3.pipe + events_by_org_ts_mv_pipe.pipe.
DEFAULT_ORGS="biu9vSF7vghBLSKW1UTDwxHBAivjnPaK GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF"
read -r -a ORGS <<< "${ORGS:-$DEFAULT_ORGS}"

FLOOR_DATE=${FLOOR_DATE:-2024-04-01}      # oldest month to export (ignores the 197001 epoch bucket)
TARGET_ROWS=${TARGET_ROWS:-4000000}       # rows per chunk — est is by equal-TIME so bursty windows run 2-3× hot; 4M keeps actual under the OOM limit, split-on-OOM backstops the rest
CONCURRENCY=${CONCURRENCY:-1}             # parallel sink jobs — prod is compute-bound, so >1 contends (each chunk ~2.5× slower) and is NET SLOWER; keep 1
SCAN_CONCURRENCY=${SCAN_CONCURRENCY:-6}   # parallel count queries during the density scan (cheap reads)
EMA_ALPHA=${EMA_ALPHA:-0.3}               # rolling-EMA weight for the throughput estimate
EMA_WINDOW=${EMA_WINDOW:-30}              # seconds per EMA sample
EXPECT_WORKSPACE=${EXPECT_WORKSPACE:-autumn_us_east_prod}
SINK=${SINK:-events_sink_s3}
COPY=${COPY:-events_by_org_ts_backfill}
ON_DEMAND=${ON_DEMAND:-1}                 # populate on isolated on-demand compute (1=on)
ODC=""; (( ON_DEMAND )) && ODC="--on-demand-compute"
RETRIES=${RETRIES:-3}
HB_TICK=${HB_TICK:-2}                     # progress redraw interval (s)

TBDIR="$(cd "$(dirname "$0")/.." && pwd)"   # …/server/tinybird
SDIR="$TBDIR/scripts"
DENSITY="$SDIR/.backfill_density"           # "org ym start_epoch end_epoch rows" for months with data
CHUNKS="$SDIR/.backfill_chunks"             # "org a_epoch b_epoch est_rows ym" planned chunks
DONE="$SDIR/.backfill_done"                 # completed chunk keys "org:a:b" (resume)
PROGRESS="$SDIR/.backfill_progress"         # "ym rows" appended per completed chunk this run (reset each run)
UNITSTATE="$SDIR/.backfill_unitstate"       # "ym unit_remaining overall_remaining" — current unit for the ticker
POPULATED="$SDIR/.backfill_populated"
FAILED="$SDIR/.backfill_failed"
LOG="$SDIR/backfill_$(date +%Y%m%d_%H%M%S).log"

hms()  { printf '%d:%02d:%02d' $(($1/3600)) $(($1%3600/60)) $(($1%60)); }
log()  { echo "[$(date +%H:%M:%S)] $*"; }
NOW=$(date -u +%s)
POP_END_TS=${POPULATE_END:-$(date -u -r "$NOW" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -u -d "@$NOW" "+%Y-%m-%d %H:%M:%S")}
mspec()  { local k=$1 op=-; (( k < 0 )) && { op=+; k=$(( -k )); }; echo "${op}${k}m"; }
mstart() { local v; v=$(mspec "$1"); date -u -v"$v" -v1d -v0H -v0M -v0S +%s 2>/dev/null \
             || date -u -d "$(date -u +%Y-%m-01) $(( -$1 )) month" +%s; }
mlabel() { local v; v=$(mspec "$1"); date -u -v"$v" +%Y%m 2>/dev/null || date -u -d "$(date -u +%Y-%m-01) $(( -$1 )) month" +%Y%m; }
isots()  { date -u -r "$1" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -u -d "@$1" "+%Y-%m-%d %H:%M:%S"; }
ts2epoch() { date -u -j -f '%Y-%m-%d %H:%M:%S' "$1" +%s 2>/dev/null || date -u -d "$1" +%s; }
hago()   { local d=$(( (NOW - $1) / 3600 )); (( d < 0 )) && d=0; echo "$d"; }
FLOOR_EPOCH=$(ts2epoch "$FLOOR_DATE 00:00:00")
POP_END_EPOCH=$(ts2epoch "$POP_END_TS")

# ---- (org, month) units, newest→oldest down to FLOOR_DATE. emits: org YYYYMM start_epoch end_epoch
units() {
  for o in "${ORGS[@]}"; do
    local m=0 s e
    while :; do
      s=$(mstart "$m"); (( s < FLOOR_EPOCH )) && break
      e=$(mstart $((m-1))); (( e > NOW )) && e=$NOW    # clamp current month to now — no empty future chunks
      echo "$o $(mlabel "$m") $s $e"
      m=$((m+1))
    done
  done
}

MODE=export; PLAN=0
for a in "$@"; do case "$a" in --populate) MODE=populate;; --retry-failed) MODE=retry;; --plan) PLAN=1;; esac; done
if (( PLAN )); then
  echo "Mode: $MODE  (chunk sizing decided at runtime from per-month row counts)"
  echo "Backfill $SINK: ${#ORGS[@]} orgs → ${FLOOR_DATE} = $(units | wc -l | tr -d ' ') month-units (newest→oldest):"
  while read -r o ym s e; do echo "  org=$o $ym  $(isots "$s") → $(isots "$e")"; done < <(units)
  exit 0
fi

cd "$TBDIR"
export TB_VERSION_WARNING=0
set -a; source .env.local 2>/dev/null; set +a

CUR_WORKSPACE=$(tb --cloud info 2>/dev/null | awk -F': ' '/^workspace_name:/{print $2; exit}' | tr -d ' ')
if [[ "$CUR_WORKSPACE" != "$EXPECT_WORKSPACE" ]]; then
  echo "Refusing to run: CLI workspace is '${CUR_WORKSPACE:-unknown}', expected '$EXPECT_WORKSPACE' (run 'tb --cloud info', or set EXPECT_WORKSPACE)." >&2
  exit 1
fi

LOCK="$SDIR/.backfill_lock"
if [[ -f "$LOCK" ]] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then
  echo "Another backfill is already running (pid $(cat "$LOCK")). Refusing to start a second." >&2; exit 1
fi
echo $$ > "$LOCK"
TICKER_PID=""
trap 'rm -f "$LOCK"; [[ -n "$TICKER_PID" ]] && kill "$TICKER_PID" 2>/dev/null' EXIT
if { true >/dev/tty; } 2>/dev/null; then exec 3>/dev/tty; HB_ON=1; else exec 3>/dev/null; HB_ON=0; fi
exec > >(tee -a "$LOG") 2>&1
trap 'echo; log "interrupted — resume by re-running (completed chunks skip)"; exit 130' INT TERM

# ============================ EXPORT (default) ===============================
count_month() {  # $1=org $2=ym $3=start_epoch $4=end_epoch → append "org ym s e rows" to DENSITY if rows>0
  local v
  v=$(tb --cloud sql "SELECT count() FROM events_by_org_ts WHERE org_id='$1' AND timestamp >= '$(isots "$3")' AND timestamp < '$(isots "$4")'" 2>&1 \
        | awk 'NF==1 && $1 ~ /^[0-9]+$/ {x=$1} END{print x+0}')
  (( v > 0 )) && echo "$1 $2 $3 $4 $v" >> "$DENSITY"
}

scan_density() {  # parallel pruned counts → DENSITY, sorted per-org newest→oldest
  : > "$DENSITY"
  local pids=() n=0
  while read -r o ym s e; do
    count_month "$o" "$ym" "$s" "$e" &
    pids+=($!); n=$((n+1))
    (( ${#pids[@]} >= SCAN_CONCURRENCY )) && { wait "${pids[0]}"; pids=("${pids[@]:1}"); }
  done < <(units)
  for p in ${pids[@]+"${pids[@]}"}; do wait "$p"; done
  sort -k1,1 -k2,2r "$DENSITY" -o "$DENSITY"   # org asc, month desc (newest first)
  log "density: $(wc -l < "$DENSITY" | tr -d ' ')/$n months have data"
}

plan_chunks() {  # DENSITY → CHUNKS: split each month into ceil(rows/TARGET_ROWS) equal time windows
  : > "$CHUNKS"
  while read -r o ym s e rows; do
    local n=$(( (rows + TARGET_ROWS - 1) / TARGET_ROWS )); (( n < 1 )) && n=1
    local span=$(( e - s )) w est i a b
    w=$(( span / n )); est=$(( rows / n ))
    for (( i=0; i<n; i++ )); do
      b=$(( e - i*w )); a=$(( e - (i+1)*w )); (( i == n-1 )) && a=$s   # oldest chunk hits exact month start
      echo "$o $a $b $est $ym" >> "$CHUNKS"
    done
  done < "$DENSITY"
}

CHUNK_FLOOR=${CHUNK_FLOOR:-3600}   # min chunk window (s) before declaring a window unexportable
run_chunk() {  # $1=org $2=a_epoch $3=b_epoch $4=est_rows $5=ym → 0 ok / 1 fail. Splits on OOM and retries.
  local key="$1:$2:$3"
  grep -qxF "$key" "$DONE" 2>/dev/null && return 0   # already exported (resume / sub-chunk dedup)
  local out sa ea; sa=$(hago "$2"); ea=$(hago "$3")
  out=$(tb --cloud sink run "$SINK" --param org_id="$1" --param start_hours_ago="$sa" --param end_hours_ago="$ea" --wait 2>&1)
  if grep -q "Data exported" <<<"$out"; then
    echo "$key" >> "$DONE"; echo "$5 $4" >> "$PROGRESS"; return 0
  fi
  if grep -qiE "MEMORY_LIMIT|Timeout exceeded" <<<"$out" && (( $3 - $2 > CHUNK_FLOOR )); then
    local mid=$(( $2 + ($3 - $2)/2 ))
    log "      ↳ too big $(isots "$2")→$(isots "$3") (~$(( $4/1000 ))k) — split & retry"
    if run_chunk "$1" "$2" "$mid" "$(( $4/2 ))" "$5" && run_chunk "$1" "$mid" "$3" "$(( $4/2 ))" "$5"; then
      echo "$key" >> "$DONE"; return 0   # both halves landed → mark parent done so resume skips it
    fi
    return 1
  fi
  if grep -qiE "MEMORY_LIMIT|Timeout exceeded" <<<"$out"; then
    echo "org=$1 $(isots "$2")→$(isots "$3") rows=$4 reason=toobig_at_floor" >> "$FAILED"
    log "  ✗ too big at floor $5 $(isots "$2")→$(isots "$3")"; return 1
  fi
  echo "org=$1 $(isots "$2")→$(isots "$3") reason=$(grep -iE 'error|exception' <<<"$out" | head -1 | cut -c1-80)" >> "$FAILED"
  log "  ✗ ERR $5 $(isots "$2")→$(isots "$3")"; return 1
}

ticker() {  # rolling-EMA throughput → current-month ETA + whole-backfill ETA, drawn to fd 3
  local ema=0 lst="$START" lsd=0 spin='|/-\' i=0
  while :; do
    local now done cym ctot otot udone
    now=$(date +%s)
    done=$(awk '{s+=$2} END{print s+0}' "$PROGRESS" 2>/dev/null)
    read -r cym ctot otot < "$UNITSTATE" 2>/dev/null || { cym="…"; ctot=0; otot=0; }
    udone=$(awk -v y="$cym" '$1==y{s+=$2} END{print s+0}' "$PROGRESS" 2>/dev/null)
    if (( now - lst >= EMA_WINDOW )); then
      ema=$(awk -v d="$done" -v ld="$lsd" -v dt="$((now-lst))" -v e="$ema" -v a="$EMA_ALPHA" \
            'BEGIN{ inst=(d-ld)/dt; if(e<=0) print (inst>0?inst:0); else print a*inst+(1-a)*e }')
      lst=$now; lsd=$done
    fi
    i=$(((i+1)%4))
    printf '\r\033[K  %s %s' "${spin:i:1}" \
      "$(awk -v od="$done" -v ot="$otot" -v ud="$udone" -v ut="$ctot" -v r="$ema" -v el="$((now-START))" -v ym="$cym" '
        function hms(s){ s=int(s); return sprintf("%d:%02d:%02d",s/3600,s%3600/60,s%60) }
        BEGIN{
          rr=(r>0)?r:((el>0)?od/el:0);    # EMA once warm, else cumulative so rate shows from 1st completion
          ueta=(rr>0)?(ut-ud)/rr:0; oeta=(rr>0)?(ot-od)/rr:0;
          printf "month %s %.0f%% eta %s  ‖  overall %.2fB/%.2fB %.0f%% · %dk/s · eta %s · elapsed %s",
            ym, (ut>0?ud*100/ut:0), hms(ueta), od/1e9, ot/1e9, (ot>0?od*100/ot:0), rr/1000, hms(oeta), hms(el)
        }')" >&3
    sleep "$HB_TICK"
  done
}

run_export() {
  [[ -f "$DONE" ]] || : > "$DONE"
  log "scanning per-month density ($(units | wc -l | tr -d ' ') units, ${SCAN_CONCURRENCY}-way)…"
  scan_density
  plan_chunks
  local total_chunks; total_chunks=$(wc -l < "$CHUNKS" | tr -d ' ')
  # remaining totals (exclude already-done chunks)
  local OVERALL_REMAIN
  OVERALL_REMAIN=$(awk -v df="$DONE" 'BEGIN{while((getline l<df)>0) d[l]=1}
    { if(!((($1":"$2":"$3)) in d)) s+=$4 } END{print s+0}' "$CHUNKS")
  : > "$PROGRESS"
  log "export: $total_chunks chunks, ~$(awk -v r="$OVERALL_REMAIN" 'BEGIN{printf "%.2fB", r/1e9}') rows remaining, ${CONCURRENCY}-way → log $LOG"
  START=$(date +%s)
  echo "init 0 $OVERALL_REMAIN" > "$UNITSTATE"   # pre-create so the ticker's first read doesn't error
  (( HB_ON )) && { ticker & TICKER_PID=$!; }

  # process unit-by-unit (newest→oldest) so the per-month ETA is well-defined
  local units_seen; units_seen=$(awk '{print $1" "$5}' "$CHUNKS" | awk '!seen[$0]++')
  while read -r org ym; do
    local urem
    urem=$(awk -v df="$DONE" -v o="$org" -v y="$ym" 'BEGIN{while((getline l<df)>0) d[l]=1}
      $1==o && $5==y { if(!((($1":"$2":"$3)) in d)) s+=$4 } END{print s+0}' "$CHUNKS")
    echo "$ym $urem $OVERALL_REMAIN" > "$UNITSTATE"
    local pids=()
    while read -r o a b est cym; do
      [[ "$o" == "$org" && "$cym" == "$ym" ]] || continue
      grep -qxF "$o:$a:$b" "$DONE" 2>/dev/null && continue
      run_chunk "$o" "$a" "$b" "$est" "$cym" &
      pids+=($!)
      (( ${#pids[@]} >= CONCURRENCY )) && { wait "${pids[0]}"; pids=("${pids[@]:1}"); }
    done < "$CHUNKS"
    for p in ${pids[@]+"${pids[@]}"}; do wait "$p"; done
    log "  ✓ $org $ym done"
  done <<< "$units_seen"

  [[ -n "$TICKER_PID" ]] && { kill "$TICKER_PID" 2>/dev/null; TICKER_PID=""; }
  printf '\r\033[K' >&3
  log "DONE (export). $(wc -l < "$DONE" | tr -d ' ') chunks complete. $( [[ -s "$FAILED" ]] && echo "Failures in $(basename "$FAILED")." || echo "No failures." )"
}

# Retry ONLY the windows in .backfill_failed (with split-on-OOM). No density rescan, leaves the
# already-exported chunks (.backfill_done) untouched. Lines look like:
#   org=<id> 2025-02-22 00:00:00→2025-03-01 00:00:00 rows=7924097 reason=oom
run_retry() {
  [[ -s "$FAILED" ]] || { log "nothing to retry ($(basename "$FAILED") empty/absent)"; return 0; }
  [[ -f "$DONE" ]] || : > "$DONE"
  local src="$FAILED.retry"; mv "$FAILED" "$src"; : > "$FAILED"; : > "$PROGRESS"
  local total; total=$(grep -c . "$src")
  log "retry-failed: $total windows from $(basename "$src"); $(wc -l < "$DONE" | tr -d ' ') chunks already done are left untouched → log $LOG"
  echo "retry 0 0" > "$UNITSTATE"
  START=$(date +%s); (( HB_ON )) && { ticker & TICKER_PID=$!; }
  local n=0
  while read -r line; do
    [[ -z "$line" ]] && continue
    local o rest sd ed rows ym a b
    o=${line#org=}; o=${o%% *}
    rest=${line#org=$o }
    sd=${rest%%→*}
    ed=${rest#*→}; ed=${ed%% rows=*}; ed=${ed%% reason=*}
    rows=${line#*rows=}; rows=${rows%% *}; [[ "$rows" =~ ^[0-9]+$ ]] || rows=4000000
    ym=${sd:0:4}${sd:5:2}
    a=$(ts2epoch "$sd"); b=$(ts2epoch "$ed")
    n=$((n+1)); log "[retry $n/$total] $o $sd → $ed (~$(( rows/1000 ))k)"
    run_chunk "$o" "$a" "$b" "$rows" "$ym"
  done < "$src"
  [[ -n "$TICKER_PID" ]] && { kill "$TICKER_PID" 2>/dev/null; TICKER_PID=""; }
  printf '\r\033[K' >&3
  log "DONE (retry). $( [[ -s "$FAILED" ]] && echo "Still failing in $(basename "$FAILED") — rerun --retry-failed to split further." || echo "All $total windows now exported." )"
}

# ============================ POPULATE (legacy, BACKFILL-skip only) ==========
LAST_REASON=""
run_copy() {
  local out cmd=(tb --cloud copy run "$COPY"); [[ -n "$ODC" ]] && cmd+=("$ODC")
  cmd+=(--param org_id="$1" --param start_date="$2" --param end_date="$3" --wait)
  out=$("${cmd[@]}" 2>&1)
  if grep -qiE "MEMORY_LIMIT" <<<"$out"; then LAST_REASON=toobig; return 1; fi
  if grep -qiE "not found" <<<"$out"; then LAST_REASON="error: ${COPY} not found"; return 1; fi
  if grep -qiE "error|exception|failed" <<<"$out"; then LAST_REASON="error: $(grep -iE 'error|exception|failed' <<<"$out" | head -1 | cut -c1-100)"; return 1; fi
  LAST_REASON=ok; return 0
}
populate_unit() {
  local o=$1 s=$2 e=$3 try=0
  (( e > POP_END_EPOCH )) && e=$POP_END_EPOCH
  (( s >= e )) && return 0
  while :; do
    if run_copy "$o" "$(isots "$s")" "$(isots "$e")"; then return 0; fi
    [[ "$LAST_REASON" == *"not found"* ]] && { log "      ✗ FATAL: ${LAST_REASON}"; exit 1; }
    if [[ "$LAST_REASON" == toobig ]] && (( e - s > 3600 )); then
      local mid=$(( s + (e-s)/2 ))
      log "      ↳ OOM — split [$(isots "$s") .. $(isots "$e")] at $(isots "$mid")"
      populate_unit "$o" "$s" "$mid" && populate_unit "$o" "$mid" "$e"; return $?
    fi
    try=$((try+1))
    if (( try <= RETRIES )); then log "      ⟳ ${LAST_REASON} — retry $try/$RETRIES in 30s"; sleep 30; continue; fi
    log "      ✗ populate failed [$(isots "$s") .. $(isots "$e")] (${LAST_REASON})"
    echo "populate org=$o start_date=$(isots "$s") end_date=$(isots "$e") reason=$LAST_REASON" >> "$FAILED"; return 1
  done
}
run_populate() {
  [[ -f "$POPULATED" ]] || : > "$POPULATED"
  log "populate: ${#ORGS[@]} orgs → ${FLOOR_DATE} (seam end ${POP_END_TS} UTC) → log $LOG"
  while read -r o ym s e; do
    grep -qxF "$o:$ym" "$POPULATED" && { log "[$o:$ym] already populated — skip"; continue; }
    log "[populate $o $ym] $(isots "$s") → $(isots "$e")"
    populate_unit "$o" "$s" "$e" && echo "$o:$ym" >> "$POPULATED"
  done < <(units)
  log "DONE (populate). $( [[ -s "$FAILED" ]] && echo "Failures in $(basename "$FAILED")." || echo "No failures." )"
}

# ---- dispatch ---------------------------------------------------------------
case "$MODE" in populate) run_populate;; retry) run_retry;; *) run_export;; esac
