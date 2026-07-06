#!/usr/bin/env bash
#
# deploy-tinybird-local.sh — deploy the repo's Tinybird schema (server/tinybird)
# to the µVM's Tinybird Local instance (:7181), once per run (WARM layer).
#
# Deploys a STAGED SUBSET of the project: datasources + materializations + API
# pipes. Excluded (cloud-only, need secrets/infra a test µVM must not have):
#   - pipes/events_sink_s3.pipe + the S3 connection (S3_ACCESS_KEY/S3_SECRET)
#   - copies/*_backfill.pipe (postgresql() into prod PG via PG_USERNAME/PG_PASSWORD)
#   - the TypeScript SDK resources in server/tinybird.config.json's include list
#     (migration_item_events — unused by integration tests)
#
# Auth: the workspace admin token comes from Tinybird Local's own /tokens
# endpoint. It persists in the instance's Redis, so the warm snapshot carries it
# and every forked worker resolves the SAME token at boot (worker/boot.ts).
set -euo pipefail

log() { echo "[tw-tinybird-deploy] $*"; }
die() { echo "[tw-tinybird-deploy] ERROR: $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TW_REPO_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
TINYBIRD_PORT="${TINYBIRD_PORT:-7181}"
TB_LOCAL_URL="http://localhost:${TINYBIRD_PORT}"
SRC="$REPO_ROOT/server/tinybird"

[ -d "$SRC/datasources" ] || die "no tinybird project at $SRC"

# Prefer the real uv-installed CLI; the image's /usr/local/bin/tb is an internal
# dev wrapper (reports "version x.y.z") we must not rely on.
TB_CLI=""
for candidate in /root/.local/bin/tb "$HOME/.local/bin/tb"; do
  if [ -x "$candidate" ]; then
    TB_CLI="$candidate"
    break
  fi
done
[ -n "$TB_CLI" ] || TB_CLI="$(command -v tb || true)"
[ -n "$TB_CLI" ] || die "tb CLI not found (bake it into the base image)"
curl -sf -o /dev/null "$TB_LOCAL_URL/tokens" || die "Tinybird Local not up on $TB_LOCAL_URL (run start-services.sh)"

TOKEN="$(curl -sf "$TB_LOCAL_URL/tokens" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["workspace_admin_token"])')"
[ -n "$TOKEN" ] || die "could not resolve workspace_admin_token from $TB_LOCAL_URL/tokens"

STAGE="$(mktemp -d /tmp/tw-tinybird-stage.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/tinybird"
cp -R "$SRC/datasources" "$SRC/materializations" "$SRC/pipes" "$STAGE/tinybird/"
rm -f "$STAGE/tinybird/pipes/events_sink_s3.pipe"

cat > "$STAGE/tinybird.config.json" <<'EOF'
{
  "include": ["tinybird/**/*.datasource", "tinybird/**/*.pipe"],
  "token": "${TINYBIRD_TOKEN}",
  "baseUrl": "${TINYBIRD_API_URL}",
  "devMode": "manual"
}
EOF

log "Deploying $(find "$STAGE/tinybird" -type f | wc -l | tr -d ' ') datafiles to $TB_LOCAL_URL"
cd "$STAGE"
TINYBIRD_TOKEN="$TOKEN" TINYBIRD_API_URL="$TB_LOCAL_URL" \
  "$TB_CLI" --host "$TB_LOCAL_URL" --token "$TOKEN" deploy \
  || die "tb deploy against Tinybird Local FAILED"
log "Tinybird Local schema deployed"
