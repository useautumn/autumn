#!/bin/bash
# Root dispatcher: routes file paths under server/ to server/run.sh.
set -euo pipefail

repo_root="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
filename="${1:-}"

if [[ -z "$filename" ]]; then
	echo "usage: $0 <file> [args...] [--headless|--tui]" >&2
	exit 1
fi

resolved="$(cd -P "$(dirname "$filename")" 2>/dev/null && pwd)/$(basename "$filename")"
shift

# Strip headless/tui flags for paths that use raw bun test (no Ink TUI).
passthrough_args=()
strip_runner_ui_flags() {
	passthrough_args=()
	for arg in "$@"; do
		case "$arg" in
		--headless | --tui) ;;
		*) passthrough_args+=("$arg") ;;
		esac
	done
}

run_leaf_eval() {
	local file="$1"
	shift
	local rel="${file#$repo_root/apps/leaf/}"
	local args=("$@")
	local filter=""

	if [[ ${#args[@]} -gt 0 && "${args[0]}" =~ ^[0-9]+$ ]]; then
		filter="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$file" "${args[0]}")"
		args=("${args[@]:1}")
	elif [[ ${#args[@]} -gt 1 && ("${args[0]}" == "-t" || "${args[0]}" == "--test-name-pattern") ]]; then
		filter="${args[1]}"
		args=("${args[@]:2}")
	fi

	strip_runner_ui_flags "${args[@]}"
	cd "$repo_root/apps/leaf"
	if [[ -n "$filter" && "$filter" != ".*" ]]; then
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- "$repo_root/node_modules/.bin/braintrust" eval "$rel" --external-packages @mastra/mcp @mastra/core pino thread-stream @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk @ngrok/ngrok --filter "evalName=$filter" "${passthrough_args[@]}"
	fi
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- "$repo_root/node_modules/.bin/braintrust" eval "$rel" --external-packages @mastra/mcp @mastra/core pino thread-stream @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk @ngrok/ngrok "${passthrough_args[@]}"
}

if [[ "$resolved" == "$repo_root/server/"* ]]; then
	# server/run.sh owns --headless|--tui for integration tests
	exec "$repo_root/server/run.sh" "$resolved" "$@"
fi

if [[ "$resolved" == "$repo_root/apps/leaf/tests/evals/"* && "$resolved" == *".eval.ts" ]]; then
	run_leaf_eval "$resolved" "$@"
fi

if [[ "$resolved" == "$repo_root/apps/leaf/tests/"* && "$resolved" == *".test.ts" ]]; then
	cd "$repo_root/apps/leaf"
	rel="${resolved#$repo_root/apps/leaf/}"
	strip_runner_ui_flags "$@"
	if [[ ${#passthrough_args[@]} -gt 0 && "${passthrough_args[0]}" =~ ^[0-9]+$ ]]; then
		test_name="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$resolved" "${passthrough_args[0]}")"
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test --timeout 0 "$rel" -t "$test_name"
	fi
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test "$rel" "${passthrough_args[@]}"
fi

if [[ "$resolved" == "$repo_root/packages/mcp/tests/"* && "$resolved" == *".test.ts" ]]; then
	cd "$repo_root/packages/mcp"
	rel="${resolved#$repo_root/packages/mcp/}"
	strip_runner_ui_flags "$@"
	if [[ "$resolved" == "$repo_root/packages/mcp/tests/evals/"* ]]; then
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test "$rel" "${passthrough_args[@]}"
	fi
	exec bun test "$rel" "${passthrough_args[@]}"
fi

if [[ "$resolved" == "$repo_root/packages/atmn/test/integration/"* && "$resolved" == *".test.ts" ]]; then
	cd "$repo_root/server"
	rel="../${resolved#$repo_root/}"
	strip_runner_ui_flags "$@"
	if [[ ${#passthrough_args[@]} -gt 0 && "${passthrough_args[0]}" =~ ^[0-9]+$ ]]; then
		test_name="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$resolved" "${passthrough_args[0]}")"
		exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test --timeout 0 "$rel" -t "$test_name"
	fi
	exec env ENV_FILE=.env infisical run --env=dev --recursive -- bun test --timeout 0 "$rel" "${passthrough_args[@]}"
fi

echo "no router for: $resolved" >&2
exit 1
