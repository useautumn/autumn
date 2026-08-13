#!/usr/bin/env bash
# Cloud-only adapter: bun dw is still stock `infisical run`, and Infisical CLI
# 0.43.116 will not exchange INFISICAL_CLIENT_ID/SECRET (or even its own
# INFISICAL_UNIVERSAL_AUTH_CLIENT_* vars) for a token on `run`. It prompts
# "No valid login session found" instead. Infisical/cli#201 would fix that;
# it is not in this CLI version.
#
# Cursor injects Runtime Secrets into every process, including agent shells
# that never source bashrc. This shim is what actually turns those credentials
# into INFISICAL_TOKEN before exec'ing the real CLI. Laptop installs are
# untouched — this only runs from Cloud install/start.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="${ROOT}/node_modules/.bin/infisical"
REAL="${ROOT}/node_modules/@infisical/cli/bin/infisical"
LOGIN="${ROOT}/scripts/setup/cursor-cloud/infisical-machine-login.sh"

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
export DW_HEADLESS="\${DW_HEADLESS:-1}"
if [ -n "\${INFISICAL_CLIENT_ID:-}" ]; then
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_ID="\${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:-\$INFISICAL_CLIENT_ID}"
	export INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET="\${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:-\${INFISICAL_CLIENT_SECRET:-}}"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ] && [ -x "\$LOGIN" ]; then
	tok="\$("\$LOGIN" 2>/dev/null || true)"
	[ -n "\$tok" ] && export INFISICAL_TOKEN="\$tok"
fi
if [ -z "\${INFISICAL_TOKEN:-}" ]; then
	echo "infisical: no machine-identity token. Add INFISICAL_CLIENT_ID/SECRET as Cursor Runtime Secrets." >&2
	exit 1
fi
exec "\$REAL" "\$@"
EOF
chmod 0755 "$BIN"
echo "[wrap-infisical] ${BIN} → machine-identity shim"
