#!/bin/bash
# Root dispatcher: routes file paths under server/ to server/run.sh.
set -e

repo_root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
filename="$1"

if [[ -z "$filename" ]]; then
	echo "usage: $0 <file> [args...]" >&2
	exit 1
fi

# Resolve to an absolute path so the prefix check works for relative inputs too.
resolved="$(cd -P "$(dirname "$filename")" 2>/dev/null && pwd)/$(basename "$filename")"

if [[ "$resolved" == "$repo_root/server/"* ]]; then
	exec "$repo_root/server/run.sh" "$resolved" "${@:2}"
fi

if [[ "$resolved" == "$repo_root/packages/mcp/tests/"* && "$resolved" == *".test.ts" ]]; then
	cd "$repo_root/packages/mcp"
	rel="${resolved#$repo_root/packages/mcp/}"
	if [[ "$resolved" == "$repo_root/packages/mcp/tests/evals/"* ]]; then
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test "$rel" "${@:2}"
	fi
	exec bun test "$rel" "${@:2}"
fi

echo "no router for: $resolved" >&2
exit 1
