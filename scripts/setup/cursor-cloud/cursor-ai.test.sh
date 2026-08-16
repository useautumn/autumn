#!/usr/bin/env bash
# Unit tests for Cursor Cloud boot helpers — no Infisical, no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CLOUD="$ROOT/scripts/setup/cursor-cloud/cursorCloud.ts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

# --- bun ai sync --copy keeps repo symlinks and copies ~/.cursor/skills ------
(cd "$ROOT/ai" && bun test src/syncSkills.test.ts)
pass "ai-sync copy mode keeps repo symlinks"

# --- mcp without a key writes interpolation ---------------------------------
env -u EXECUTOR_API_KEY bun "$CLOUD" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp
python3 - "$tmp/repo/.cursor/mcp.json" "$tmp/user-mcp.json" <<'PY'
import json, sys
for path in sys.argv[1:]:
    data = json.load(open(path))
    ex = data["mcpServers"]["executor"]
    assert ex["url"] == "https://executor.sh/mcp", path
    assert ex["headers"]["Authorization"] == "Bearer ${env:EXECUTOR_API_KEY}", path
    assert "oauth" not in ex, path
print("mcp-template json ok")
PY
pass "mcp without a key uses env interpolation"

# --- mcp with a key writes the bearer from env ------------------------------
export EXECUTOR_API_KEY="test-executor-key-not-real"
bun "$CLOUD" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
auth = data["mcpServers"]["executor"]["headers"]["Authorization"]
assert auth == "Bearer test-executor-key-not-real", auth
assert "${env:" not in auth
print("mcp-inject json ok")
PY
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
data["mcpServers"]["axiom"] = {"url": "https://mcp.axiom.co/mcp"}
open(path, "w").write(json.dumps(data, indent="\t") + "\n")
PY
bun "$CLOUD" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data["mcpServers"]["axiom"]["url"] == "https://mcp.axiom.co/mcp"
assert data["mcpServers"]["executor"]["headers"]["Authorization"] == "Bearer test-executor-key-not-real"
print("mcp-inject preserves other servers")
PY
pass "mcp writes bearer and keeps other servers"

# --- AGENTS.md section is idempotent ----------------------------------------
printf '%s\n' '# Existing agents' >"$tmp/repo/AGENTS.md"
printf '%s\n' 'trailing note' >>"$tmp/repo/AGENTS.md"
bun "$CLOUD" --root "$tmp/repo" agents-md
# Put a trailer after the section so the second write must preserve it.
printf '%s\n' 'after-section' >>"$tmp/repo/AGENTS.md"
bun "$CLOUD" --root "$tmp/repo" agents-md
count="$(grep -c 'Cursor Cloud specific instructions' "$tmp/repo/AGENTS.md" || true)"
[[ "$count" == "1" ]] || fail "expected 1 cloud section, got $count"
grep -q 'Existing agents' "$tmp/repo/AGENTS.md" || fail "preamble lost"
grep -q 'after-section' "$tmp/repo/AGENTS.md" || fail "trailer after cloud section lost"
pass "AGENTS.md cloud section is idempotent"

if grep -q 'cursor_ai.py' "$ROOT/scripts/setup/cursor-cloud/install.sh" \
	"$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "install/start must not call cursor_ai.py"
fi
if grep -q 'configure-executor-mcp.sh' "$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "start must not call configure-executor-mcp.sh"
fi
pass "install/start use bun ai sync --copy and cursorCloud.ts"

# --- Infisical: Token Auth INFISICAL_TOKEN is enough; no mint ---------------
LOGIN="$ROOT/scripts/setup/cursor-cloud/infisical-machine-login.sh"
cache_dir="$tmp/infisical-home"
mkdir -p "$cache_dir/.cache"
got="$(
	HOME="$cache_dir" \
	INFISICAL_TOKEN="test-token-auth-not-real" \
	env -u INFISICAL_CLIENT_ID -u INFISICAL_CLIENT_SECRET \
		-u INFISICAL_UNIVERSAL_AUTH_CLIENT_ID -u INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET \
		bash "$LOGIN"
)"
[[ "$got" == "test-token-auth-not-real" ]] || fail "login should pass through INFISICAL_TOKEN, got $got"
[[ ! -s "$cache_dir/.cache/autumn-infisical-token" ]] || fail "passthrough must not mint/write cache"
printf '%s' "cached-token-auth" >"$cache_dir/.cache/autumn-infisical-token"
# Older than 90 minutes: Token Auth must still win (no 90-min TTL).
touch -d "2 hours ago" "$cache_dir/.cache/autumn-infisical-token"
got="$(
	HOME="$cache_dir" \
	env -u INFISICAL_TOKEN -u INFISICAL_CLIENT_ID -u INFISICAL_CLIENT_SECRET \
		-u INFISICAL_UNIVERSAL_AUTH_CLIENT_ID -u INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET \
		bash "$LOGIN"
)"
[[ "$got" == "cached-token-auth" ]] || fail "cache should be reused without TTL, got $got"
if HOME="$tmp/empty-home" \
	env -u INFISICAL_TOKEN -u INFISICAL_CLIENT_ID -u INFISICAL_CLIENT_SECRET \
		-u INFISICAL_UNIVERSAL_AUTH_CLIENT_ID -u INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET \
		bash "$LOGIN" >/dev/null 2>"$tmp/login.err"; then
	fail "login should fail without token, cache, or client creds"
fi
grep -q "no INFISICAL_TOKEN" "$tmp/login.err" || fail "missing-creds error should mention INFISICAL_TOKEN"
pass "infisical-machine-login prefers Token Auth / cache over mint"

# --- isolation overlay wins over laptop Redis :6380 -------------------------
export CACHE_V2_DRAGONFLY_URL="redis://localhost:6380"
export MISC_CACHE_DRAGONFLY_PRIVATE_URL="rediss://dragonfly.example:6385"
export NEON_WORKTREE_API_KEY="should-unset"
got="$(bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" printenv CACHE_V2_DRAGONFLY_URL)"
[[ "$got" == "redis://localhost:6379" ]] || fail "CACHE_V2_DRAGONFLY_URL overlay, got $got"
if bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" printenv MISC_CACHE_DRAGONFLY_PRIVATE_URL >/dev/null 2>&1; then
	val="$(bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" printenv MISC_CACHE_DRAGONFLY_PRIVATE_URL || true)"
	[[ -z "$val" ]] || fail "private dragonfly URL should be unset, got $val"
fi
neon="$(bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" bash -c 'printf %s "${NEON_WORKTREE_API_KEY-}"')"
[[ -z "$neon" ]] || fail "NEON_WORKTREE_API_KEY should be unset"
export CACHE_BACKUP_URL="rediss://example.dragonflydb.cloud:6385"
backup="$(bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" bash -c 'printf %s "${CACHE_BACKUP_URL-}"')"
[[ -z "$backup" ]] || fail "CACHE_BACKUP_URL should be unset, got $backup"
sqs="$(bash "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" printenv SQS_QUEUE_URL)"
[[ "$sqs" == *localhost:9324* ]] || fail "SQS overlay, got $sqs"
pass "with-isolation.sh overlays Infisical laptop Redis/SQS"

if grep -E '^AWS_ACCESS_KEY_ID=x' "$ROOT/scripts/setup/cursor-cloud/isolation.env"; then
	fail "isolation.env must not pin dummy AWS_ACCESS_KEY_ID=x (breaks S3)"
fi
if grep -q 'skipping eve (npx' "$ROOT/scripts/dev.ts"; then
	fail "eve skip must not be an echo-with-parens concurrently command"
fi
pass "isolation.env has no dummy AWS keys; eve skip is not a concurrently echo"

# --- Cloud public-urls.txt parser used by bun dw identify -------------------
got="$(cd "$ROOT" && bun -e '
import { firstHttpsUrl } from "./scripts/dw/helpers/ngrok.ts";
const a = firstHttpsUrl("https://abc.ngrok.app.\n");
if (a !== "https://abc.ngrok.app") throw new Error("plain "+a);
const b = firstHttpsUrl("proxy (http://localhost:3080): https://may-waspy-marquis.ngrok-free.dev\n");
if (b !== "https://may-waspy-marquis.ngrok-free.dev") throw new Error("labeled "+b);
if (firstHttpsUrl("ngrok: not running\n") !== undefined) throw new Error("empty");
console.log("ok");
')"
[[ "$got" == "ok" ]] || fail "firstHttpsUrl, got $got"
pass "identify reads the first https origin"

grep -q 'ensureNgrok(entry' "$ROOT/scripts/dw/commands/identify.ts" \
	|| fail "identify must start the ngrok tunnel"
if [[ -f "$ROOT/scripts/setup/cursor-cloud/ngrok-up.sh" ]] \
	|| [[ -f "$ROOT/scripts/setup/cursor-cloud/ngrok.sh" ]]; then
	fail "Cloud ngrok shells must be deleted; dw ensureNgrok owns the tunnel"
fi
if rg -n 'unset NGROK_API_KEY' "$ROOT/scripts/dw" "$ROOT/scripts/setup/cursor-cloud" \
	-g '!cursor-ai.test.sh'; then
	fail "must not unset NGROK_API_KEY"
fi
pass "identify uses ensureNgrok; no Cloud ngrok shells"

UNIT_TESTS=1 env -u TESTS_ORG bun test \
	"$ROOT/scripts/dw/helpers/ngrok.test.ts" \
	"$ROOT/scripts/dw/helpers/machineId.test.ts" \
	"$ROOT/scripts/dw/helpers/registry.test.ts" \
	"$ROOT/scripts/dw/devProxy/routes.test.ts" \
	"$ROOT/scripts/dw/devProxy/server.test.ts" \
	|| fail "dw unit tests failed"
pass "dw reserved names, machine-id, path proxy"

echo "all cursor-cloud boot tests passed"
