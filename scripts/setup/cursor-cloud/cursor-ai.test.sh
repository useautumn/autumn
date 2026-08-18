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
python3 - "$tmp/repo/.cursor/mcp.json" "$tmp/user-mcp.json" <<'PY'
import json, sys
project = json.load(open(sys.argv[1]))
user = json.load(open(sys.argv[2]))
project_auth = project["mcpServers"]["executor"]["headers"]["Authorization"]
user_auth = user["mcpServers"]["executor"]["headers"]["Authorization"]
assert project_auth == "Bearer ${env:EXECUTOR_API_KEY}", project_auth
assert user_auth == "Bearer test-executor-key-not-real", user_auth
assert "${env:" not in user_auth
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
assert data["mcpServers"]["executor"]["headers"]["Authorization"] == "Bearer ${env:EXECUTOR_API_KEY}"
print("mcp-inject preserves other servers")
PY
pass "mcp writes bearer and keeps other servers"

# --- committed MCP template is discoverable before start -------------------
PROJECT_MCP="$ROOT/.cursor/mcp.json"
[[ -f "$PROJECT_MCP" ]] || fail "project MCP template is missing"
if git -C "$ROOT" check-ignore -q ".cursor/mcp.json"; then
	fail "project MCP template must be tracked at checkout"
fi
python3 - "$PROJECT_MCP" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
ex = data["mcpServers"]["executor"]
assert ex["url"] == "https://executor.sh/mcp"
assert ex["headers"]["Authorization"] == "Bearer ${env:EXECUTOR_API_KEY}"
assert "oauth" not in ex
PY
pass "project MCP template is safe and discoverable at checkout"

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
if [[ -f "$ROOT/scripts/setup/cursor-cloud/wrap-infisical-bin.sh" ]]; then
	fail "must not wrap node_modules/.bin/infisical — export INFISICAL_TOKEN instead"
fi
if grep -q 'wrap-infisical-bin' "$ROOT/scripts/setup/cursor-cloud/install.sh" \
	"$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "install/start must not wrap the infisical bin"
fi
if [[ -f "$ROOT/scripts/setup/cursor-cloud/infisical-machine-login.sh" ]]; then
	fail "must not mint via infisical-machine-login.sh — use INFISICAL_TOKEN"
fi
if grep -q 'infisical-machine-login' "$ROOT/scripts/setup/cursor-cloud/install.sh" \
	"$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "install/start must not call infisical-machine-login"
fi
pass "install/start use bun ai sync --copy and cursorCloud.ts"

if grep -q 'export CLOUD_AGENT=1' "$ROOT/scripts/setup/cursor-cloud/start.sh" \
	&& grep -q 'export CLOUD_AGENT=1' "$ROOT/scripts/setup/cursor-cloud/install.sh"; then
	pass "Cloud boot exports CLOUD_AGENT=1"
else
	fail "install/start must export CLOUD_AGENT=1"
fi

if [[ -f "$ROOT/scripts/setup/cursor-cloud/isolation.env" ]] \
	|| [[ -f "$ROOT/scripts/setup/cursor-cloud/with-isolation.sh" ]]; then
	fail "isolation overlay must be deleted; bun dw Cloud-agent mode owns localhost"
fi
if grep -q 'isolation.env' "$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "start must not source isolation.env"
fi
if grep -q 'skipping eve (npx' "$ROOT/scripts/dev.ts"; then
	fail "eve skip must not be an echo-with-parens concurrently command"
fi
pass "no isolation.env overlay; eve skip is not a concurrently echo"

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

grep -q 'cloudflared-linux' "$ROOT/scripts/setup/cursor-cloud/install.sh" \
	|| fail "install must pin a cloudflared linux binary"
if grep -q 'ngrok-v3-stable' "$ROOT/scripts/setup/cursor-cloud/install.sh"; then
	fail "install must not download ngrok; cloudflared owns public access"
fi
grep -q 'CLOUDFLARE_TUNNEL_API_TOKEN' "$ROOT/scripts/setup/cursor-cloud/start.sh" \
	|| fail "start must pull CLOUDFLARE_TUNNEL_API_TOKEN from Infisical"
if grep -q 'NGROK_AUTHTOKEN' "$ROOT/scripts/setup/cursor-cloud/start.sh"; then
	fail "start must not require NGROK_AUTHTOKEN for the public tunnel"
fi
if grep -q '3080' "$ROOT/.cursor/environment.json" \
	"$ROOT/scripts/setup/cursor-cloud/access.sh"; then
	fail "Cloud access must not point at the old path-proxy port 3080"
fi
pass "Cloud boot installs cloudflared and injects tunnel tokens"

grep -q 'ensurePublicAccess' "$ROOT/scripts/dw/commands/setup.ts" \
	|| fail "setup must ensure Cloudflare public access"
if [[ -f "$ROOT/scripts/setup/cursor-cloud/ngrok-up.sh" ]] \
	|| [[ -f "$ROOT/scripts/setup/cursor-cloud/ngrok.sh" ]]; then
	fail "Cloud ngrok shells must be deleted; dw ensurePublicAccess owns the tunnel"
fi
if rg -n 'unset NGROK_API_KEY' "$ROOT/scripts/dw" "$ROOT/scripts/setup/cursor-cloud" \
	-g '!cursor-ai.test.sh'; then
	fail "must not unset NGROK_API_KEY"
fi
pass "setup uses ensurePublicAccess; no Cloud ngrok shells"

UNIT_TESTS=1 env -u TESTS_ORG bun test \
	"$ROOT/scripts/dw/helpers/git.test.ts" \
	"$ROOT/scripts/dw/helpers/ngrok.test.ts" \
	"$ROOT/scripts/dw/helpers/machineId.test.ts" \
	"$ROOT/scripts/dw/helpers/registry.test.ts" \
	"$ROOT/scripts/dw/helpers/cloudflare.test.ts" \
	"$ROOT/scripts/dw/devProxy/cloudflareConfig.test.ts" \
	|| fail "dw unit tests failed"
pass "dw reserved names, machine-id, cloudflare hosts"

echo "all cursor-cloud boot tests passed"
