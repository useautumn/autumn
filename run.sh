#!/bin/bash
# Root dispatcher: routes file paths under server/ to server/run.sh.
set -e

repo_root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
filename="$1"

if [[ -z "$filename" ]]; then
	echo "usage: $0 <file> [args...]" >&2
	exit 1
fi

resolved="$(cd -P "$(dirname "$filename")" 2>/dev/null && pwd)/$(basename "$filename")"

run_leaf_eval() {
	local file="$1"
	shift
	local rel="${file#$repo_root/apps/leaf/}"
	local args=("$@")
	local filter=""

	if [[ "${args[0]}" =~ ^[0-9]+$ ]]; then
		filter="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$file" "${args[0]}")"
		args=("${args[@]:1}")
	elif [[ "${args[0]}" == "-t" || "${args[0]}" == "--test-name-pattern" ]]; then
		filter="${args[1]}"
		args=("${args[@]:2}")
	fi

	cd "$repo_root/apps/leaf"
	if [[ -n "$filter" && "$filter" != ".*" ]]; then
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- "$repo_root/node_modules/.bin/braintrust" eval "$rel" --external-packages @mastra/mcp @mastra/core --filter "evalName=$filter" "${args[@]}"
	fi
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- "$repo_root/node_modules/.bin/braintrust" eval "$rel" --external-packages @mastra/mcp @mastra/core "${args[@]}"
}

if [[ "$resolved" == "$repo_root/server/"* ]]; then
	exec "$repo_root/server/run.sh" "$resolved" "${@:2}"
fi

if [[ "$resolved" == "$repo_root/apps/leaf/tests/evals/"* && "$resolved" == *".eval.ts" ]]; then
	run_leaf_eval "$resolved" "${@:2}"
fi

if [[ "$resolved" == "$repo_root/apps/leaf/tests/"* && "$resolved" == *".test.ts" ]]; then
	cd "$repo_root/apps/leaf"
	rel="${resolved#$repo_root/apps/leaf/}"
	if [[ "${2:-}" =~ ^[0-9]+$ ]]; then
		test_name="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$resolved" "$2")"
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test --timeout 0 "$rel" -t "$test_name"
	fi
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test "$rel" "${@:2}"
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
