#!/usr/bin/env bash
# Cloud-only adapter: bun dw is still stock `infisical run`.
# Prefer INFISICAL_TOKEN (Token Auth access token). Fall back to the cached
# copy start wrote, then to universal-auth login if only client id/secret exist.
# `run` will not exchange client credentials (Infisical/cli#201 still open).
# Laptop installs are untouched — Cloud install/start only.
#
# Machine-identity `run` also requires INFISICAL_PROJECT_ID (CLI 0.43.116 does
# not read .infisical.json workspaceId for this auth mode). Load it from the
# committed workspaceId when unset — do not store it as a Cursor Runtime Secret.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="${ROOT}/node_modules/.bin/infisical"
REAL="${ROOT}/node_modules/@infisical/cli/bin/infisical"
LOGIN="${ROOT}/scripts/setup/cursor-cloud/infisical-machine-login.sh"
WITH_ISOL="${ROOT}/scripts/setup/cursor-cloud/with-isolation.sh"

if [ ! -x "$REAL" ]; then
	echo "[wrap-infisical] skip: ${REAL} not installed"
	exit 0
fi

mkdir -p "$(dirname "$BIN")"
rm -f "$BIN"
cat > "$BIN" <<EOF
#!/usr/bin/env bash
# autumn-infisical-shim
set -euo pipefail
REAL="${REAL}"
LOGIN="${LOGIN}"
WITH_ISOL="${WITH_ISOL}"
# Husky runs \`infisical scan\` — that must not require a machine-identity token.
if [ "\$1" != "run" ]; then
	exec "\$REAL" "\$@"
fi
CACHE="\${HOME}/.cache/autumn-infisical-token"
export DW_HEADLESS="\${DW_HEADLESS:-1}"
if [ -n "\${INFISICAL_CLIENT_ID:-}" ]; then
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="\${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-\$INFISICAL_CLIENT_ID}"
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="\${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-\${INFISICAL_CLIENT_SECRET:-}}"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ] && [ -s "\$CACHE" ]; then
	export INFISICAL_TOKEN="\$(cat "\$CACHE")"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ] && [ -x "\$LOGIN" ]; then
	tok=""
	tok="\$("\$LOGIN")" || true
	[ -n "\$tok" ] && export INFISICAL_TOKEN="\$tok"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ]; then
	echo "infisical: no INFISICAL_TOKEN in this process and no cached token from start." >&2
	echo "infisical: set Team Runtime Secret INFISICAL_TOKEN (machine-identity Token Auth → Create Token)." >&2
	echo "infisical: INFISICAL_CLIENT_ID/SECRET is only a fallback — CLI run will not exchange them." >&2
	exit 1
fi
if [ -z "\${INFISICAL_PROJECT_ID:-}" ] && [ -f "${ROOT}/.infisical.json" ]; then
	INFISICAL_PROJECT_ID="\$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("workspaceId") or "")' "${ROOT}/.infisical.json" 2>/dev/null || true)"
	[ -n "\$INFISICAL_PROJECT_ID" ] && export INFISICAL_PROJECT_ID
fi
if [ -z "\${INFISICAL_PROJECT_ID:-}" ]; then
	echo "infisical: machine identity requires INFISICAL_PROJECT_ID (workspaceId in .infisical.json)." >&2
	exit 1
fi
# infisical run injects vault secrets into the child. Re-apply localhost
# isolation after that so laptop Redis :6380 / shared SQS cannot leak.
if [ -x "\$WITH_ISOL" ]; then
	before=()
	while [ \$# -gt 0 ]; do
		if [ "\$1" = "--" ]; then
			shift
			exec "\$REAL" "\${before[@]}" -- "\$WITH_ISOL" "\$@"
		fi
		before+=("\$1")
		shift
	done
fi
exec "\$REAL" "\$@"
EOF
chmod 0755 "$BIN"
echo "[wrap-infisical] ${BIN} → machine-identity shim"
