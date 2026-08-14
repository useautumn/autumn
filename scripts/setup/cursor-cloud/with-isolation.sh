#!/usr/bin/env bash
# Apply Cursor Cloud localhost overlay AFTER Infisical injects vault secrets.
# `infisical run` otherwise leaves laptop-docker Redis :6380 and shared SQS
# in the child. Never print secret values.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ISOL="${HERE}/isolation.env"
if [ -f "$ISOL" ]; then
	set -a
	# shellcheck disable=SC1091
	. "$ISOL"
	set +a
fi
# Private VPC Dragonfly must not win over localhost public URL.
unset NEON_WORKTREE_API_KEY
unset MISC_CACHE_DRAGONFLY_PRIVATE_URL
# Legacy vault key; misc backup now lives in S3 edge-config. Unset anyway.
unset CACHE_BACKUP_URL
if [ $# -eq 0 ]; then
	echo "with-isolation: missing command" >&2
	exit 2
fi
exec "$@"
