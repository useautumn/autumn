#!/usr/bin/env bash
# Unit tests for Conductor workspace setup — no Infisical, no network.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

INFISICAL="$ROOT/.conductor/ensureInfisical.sh"
SETUP="$ROOT/.conductor/setup.sh"
WORKTREE_INCLUDE="$ROOT/.worktreeinclude"

# --- missing machine identity must not fail setup (local Conductor) ------
if ! env -u INFISICAL_TOKEN -u INFISICAL_CLIENT_ID -u INFISICAL_CLIENT_SECRET \
	HOME="$tmp" bash -c 'set -euo pipefail; . "$1"; ensure_infisical_session' \
	_ "$INFISICAL"; then
	fail "ensure_infisical_session must not fail without machine identity"
fi
pass "missing machine identity is non-fatal"

# --- cached token is exported for later shells -------------------------------
mkdir -p "$tmp/home/.cache"
printf 'st-test-token' >"$tmp/home/.cache/autumn-infisical-token"
got="$(
	env -u INFISICAL_TOKEN -u INFISICAL_CLIENT_ID -u INFISICAL_CLIENT_SECRET \
		HOME="$tmp/home" bash -c '
			set -euo pipefail
			. "$1"
			ensure_infisical_session >/dev/null
			printf %s "$INFISICAL_TOKEN"
		' _ "$INFISICAL"
)"
[[ "$got" == "st-test-token" ]] || fail "cached token not exported, got '$got'"
pass "cached Infisical token is exported"

# --- machine identity login still fails closed if the CLI cannot mint ------
mkdir -p "$tmp/bin" "$tmp/empty-home"
cat >"$tmp/bin/infisical" <<'SH'
#!/bin/sh
echo "login exploded" >&2
exit 1
SH
chmod +x "$tmp/bin/infisical"
if env -u INFISICAL_TOKEN \
	INFISICAL_CLIENT_ID=id INFISICAL_CLIENT_SECRET=secret \
	HOME="$tmp/empty-home" PATH="$tmp/bin:$PATH" \
	bash -c 'set -euo pipefail; . "$1"; ensure_infisical_session' \
	_ "$INFISICAL"; then
	fail "ensure_infisical_session must fail when machine-identity login fails"
fi
pass "machine-identity login failure is still fatal"

# --- setup.sh bun installs, then bun dw setup (no extra wrapper) -------------
grep -q '^bun install$' "$SETUP" || fail "setup.sh must bun install for the Infisical CLI"
grep -q '^bun dw setup$' "$SETUP" || fail "setup.sh must call bun dw setup"
install_line="$(rg -n '^bun install$' "$SETUP" | head -1 | cut -d: -f1)"
dw_line="$(rg -n '^bun dw setup$' "$SETUP" | head -1 | cut -d: -f1)"
[[ -n "$install_line" && -n "$dw_line" && "$install_line" -lt "$dw_line" ]] \
	|| fail "setup.sh must bun install before bun dw setup"
pass "setup.sh bun installs, then bun dw setup"

# --- generated MCP configs must exist before the first agent starts ----------
for pattern in \
	'.env*' \
	'/.mcp.json' \
	'/.codex/config.toml' \
	'/.cursor/mcp.json' \
	'/.opencode/opencode.json'; do
	grep -qxF "$pattern" "$WORKTREE_INCLUDE" \
		|| fail ".worktreeinclude must copy $pattern"
done
pass "all bun ai sync MCP outputs are copied before agent startup"

python3 - "$ROOT/package.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
scripts = data["scripts"]
if "cli.sh" in scripts.get("dw", "") or "cli.sh" in scripts.get("dw:setup", ""):
    raise SystemExit("package.json dw scripts must not go through a bash wrapper")
for key, value in scripts.items():
    if key == "dw" or key.startswith("dw:"):
        if "bun install" in value:
            raise SystemExit(f"package.json {key} must not bun install")
PY
pass "package.json dw scripts stay as infisical run"

if grep -q 'bun", \["install"\]' "$ROOT/scripts/dw/commands/run.ts" \
	"$ROOT/scripts/dw/commands/identify.ts" \
	"$ROOT/scripts/dw/commands/start.ts"; then
	fail "run/identify/start must not bun install"
fi
grep -q 'bun", \["install"\]' "$ROOT/scripts/dw/commands/setup.ts" \
	|| fail "cmdSetup must bun install"
pass "setup.ts installs; run/identify/start do not"

# --- Run button must not re-run setup ---------------------------------------
if grep -q '$(dirname "$0")/setup.sh' "$ROOT/.conductor/workspace.sh"; then
	fail "workspace.sh must not call setup.sh — run is bun dw run, not setup"
fi
grep -q 'exec bun dw run' "$ROOT/.conductor/workspace.sh" \
	|| fail "workspace.sh must exec bun dw run"
grep -q 'command = "bash .conductor/workspace.sh"' "$ROOT/.conductor/settings.toml" \
	|| fail "run.dev must stay on workspace.sh (docker-on-resume), not setup.sh"
pass "run button does not alias bun dw run to setup"

echo "all conductor setup tests passed"
