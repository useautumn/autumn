#!/usr/bin/env bash
# A prepared snapshot has /app/.qa-ready and boots the stack; the bare image idles for prepare.sh.
set -euo pipefail
if [ -f /app/.qa-ready ]; then
	exec /qa/boot.sh
fi
exec sleep infinity
