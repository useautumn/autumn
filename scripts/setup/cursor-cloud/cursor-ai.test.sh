#!/usr/bin/env bash
# Unit tests for cursor_ai.py — no Infisical, no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PY="$ROOT/scripts/setup/cursor-cloud/cursor_ai.py"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

# --- materialize replaces a skill symlink with a real directory -------------
src="$tmp/ai/config/skills/general/autumn-tdd-test"
mkdir -p "$src"
printf '%s\n' '---' 'name: autumn-tdd-test' 'description: test' '---' '# hi' >"$src/SKILL.md"
mkdir -p "$tmp/repo/.cursor/skills"
ln -s "$src" "$tmp/repo/.cursor/skills/autumn-tdd-test"
mkdir -p "$tmp/repo/.cursor/skills"
src_tdd="$tmp/ai/config/skills/general/tdd"
mkdir -p "$src_tdd"
printf '%s\n' '---' 'name: tdd' 'description: test' '---' '# tdd' >"$src_tdd/SKILL.md"
ln -s "$src_tdd" "$tmp/repo/.cursor/skills/tdd"

python3 "$PY" --root "$tmp/repo" --user-skills "$tmp/user-skills" materialize

[[ -f "$tmp/repo/.cursor/skills/autumn-tdd-test/SKILL.md" ]] || fail "copied SKILL.md missing"
[[ ! -L "$tmp/repo/.cursor/skills/autumn-tdd-test" ]] || fail "autumn-tdd-test still a symlink"
[[ -f "$tmp/user-skills/tdd/SKILL.md" ]] || fail "user skills tdd missing"
[[ ! -L "$tmp/user-skills/autumn-tdd-test" ]] || fail "user skill still a symlink"
grep -q '# hi' "$tmp/repo/.cursor/skills/autumn-tdd-test/SKILL.md" || fail "skill body missing"
pass "materialize copies skill symlinks"

# second run is idempotent (already-real dirs)
python3 "$PY" --root "$tmp/repo" --user-skills "$tmp/user-skills" materialize
[[ -f "$tmp/repo/.cursor/skills/tdd/SKILL.md" ]] || fail "tdd disappeared on second materialize"
pass "materialize is idempotent"

# --- mcp-template writes interpolation, never a secret ----------------------
python3 "$PY" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp-template
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
pass "mcp-template uses env interpolation"

# --- mcp-inject writes the bearer from env, not argv ------------------------
export EXECUTOR_API_KEY="test-executor-key-not-real"
python3 "$PY" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp-inject
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
auth = data["mcpServers"]["executor"]["headers"]["Authorization"]
assert auth == "Bearer test-executor-key-not-real", auth
assert "${env:" not in auth
print("mcp-inject json ok")
PY
# rewrite with an extra server then inject
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
data["mcpServers"]["axiom"] = {"url": "https://mcp.axiom.co/mcp"}
open(path, "w").write(json.dumps(data, indent="\t") + "\n")
PY
python3 "$PY" --root "$tmp/repo" --user-mcp "$tmp/user-mcp.json" mcp-inject
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
assert data["mcpServers"]["axiom"]["url"] == "https://mcp.axiom.co/mcp"
assert data["mcpServers"]["executor"]["headers"]["Authorization"] == "Bearer test-executor-key-not-real"
print("mcp-inject preserves other servers")
PY
pass "mcp-inject writes bearer and keeps other servers"

# --- AGENTS.md section is idempotent ----------------------------------------
printf '%s\n' '# Existing agents' >"$tmp/repo/AGENTS.md"
python3 "$PY" --root "$tmp/repo" agents-md
python3 "$PY" --root "$tmp/repo" agents-md
count="$(grep -c 'Cursor Cloud specific instructions' "$tmp/repo/AGENTS.md" || true)"
[[ "$count" == "1" ]] || fail "expected 1 cloud section, got $count"
grep -q 'Existing agents' "$tmp/repo/AGENTS.md" || fail "preamble lost"
pass "AGENTS.md cloud section is idempotent"

# --- configure-executor-mcp.sh with a pre-set key (no Infisical) ------------
unset AUTUMN_ROOT AUTUMN_AGENT_ENV_SH AUTUMN_USER_MCP
export AUTUMN_ROOT="$tmp/repo"
export AUTUMN_AGENT_ENV_SH="$tmp/env.sh"
export AUTUMN_USER_MCP="$tmp/user-mcp.json"
printf '%s\n' '# env' >"$tmp/env.sh"
export EXECUTOR_API_KEY="test-executor-key-not-real"
bash "$ROOT/scripts/setup/cursor-cloud/configure-executor-mcp.sh"
grep -q 'export EXECUTOR_API_KEY=' "$tmp/env.sh" || fail "env.sh missing EXECUTOR_API_KEY export"
python3 - "$tmp/repo/.cursor/mcp.json" <<'PY'
import json, sys
auth = json.load(open(sys.argv[1]))["mcpServers"]["executor"]["headers"]["Authorization"]
assert auth == "Bearer test-executor-key-not-real", auth
print("configure-executor-mcp json ok")
PY
# re-run does not stack export lines
bash "$ROOT/scripts/setup/cursor-cloud/configure-executor-mcp.sh"
count="$(grep -c '^export EXECUTOR_API_KEY=' "$tmp/env.sh" || true)"
[[ "$count" == "1" ]] || fail "expected 1 EXECUTOR_API_KEY export, got $count"
pass "configure-executor-mcp.sh writes env.sh + mcp.json"

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
got="$(cd "$ROOT" && DW_HEADLESS=1 bun -e '
import { parseCloudPublicUrls } from "./scripts/dw/helpers/cloudPublicUrls.ts";
const t = "api (http://localhost:8080): https://api.example.ngrok.app\nvite (http://localhost:3000): https://vite.example.ngrok.app\n";
const u = parseCloudPublicUrls(t);
if (u.api !== "https://api.example.ngrok.app") throw new Error("api "+u.api);
if (u.vite !== "https://vite.example.ngrok.app") throw new Error("vite "+u.vite);
console.log("ok");
')"
[[ "$got" == "ok" ]] || fail "parseCloudPublicUrls, got $got"
pass "identify Cloud public-urls parser"

grep -q 'ensureHeadlessNgrok(entry)' "$ROOT/scripts/dw/commands/identify.ts" \
	|| fail "identify must start the Cloud tunnel"
pass "bun dw identify starts Cloud ngrok"

# ngrok-up without a token must not hang (bun dw setup calls this)
timeout 8 bash "$ROOT/scripts/setup/cursor-cloud/ngrok-up.sh" >/tmp/ngrok-up.out 2>&1 || true
if grep -q "no NGROK_AUTHTOKEN or ngrok binary" /tmp/ngrok-up.out \
	|| grep -q "already running" /tmp/ngrok-up.out \
	|| grep -q "starting tunnels" /tmp/ngrok-up.out; then
	pass "ngrok-up.sh returns quickly without hanging"
else
	fail "ngrok-up.sh unexpected output: $(head -c 400 /tmp/ngrok-up.out)"
fi

echo "all cursor_ai.py tests passed"
