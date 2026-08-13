#!/usr/bin/env bash
# Point node_modules/.bin/infisical at a shim that mints a machine-identity
# token before exec'ing the real CLI. Cursor agent shells do not source
# bashrc, so INFISICAL_TOKEN from start never reaches `bun dw` otherwise.
#
# Laptop installs are untouched: this only runs from Cloud install/start.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="${ROOT}/node_modules/.bin/infisical"
REAL="${ROOT}/node_modules/@infisical/cli/bin/infisical"
LOGIN="${ROOT}/scripts/setup/cursor-cloud/infisical-machine-login.sh"

if [ ! -x "$REAL" ]; then
	echo "[wrap-infisical] skip: ${REAL} not installed"
	exit 0
fi

if [ -f "$BIN" ] && grep -q autumn-infisical-shim "$BIN" 2>/dev/null; then
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
if [ -z "\${INFISICAL_TOKEN:-}" ] && [ -x "\$LOGIN" ]; then
	tok="\$("\$LOGIN" 2>/dev/null || true)"
	[ -n "\$tok" ] && export INFISICAL_TOKEN="\$tok"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ]; then
	echo "infisical: no machine-identity token (INFISICAL_CLIENT_ID/SECRET). Refusing interactive login." >&2
	exit 1
fi
exec "\$REAL" "\$@"
EOF
chmod 0755 "$BIN"
echo "[wrap-infisical] ${BIN} → machine-identity shim"
