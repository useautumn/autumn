#!/bin/bash
# Run current file (server/). Supports --headless|--tui for .test.ts via bun t.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

filename=""
line=""
test_pattern=""
runner_flags=()
use_dispatcher=0

args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
	arg="${args[$i]}"
	case "$arg" in
	--headless)
		use_dispatcher=1
		runner_flags+=(--headless)
		;;
	--tui)
		use_dispatcher=1
		runner_flags+=(--tui)
		;;
	--verbose | -v)
		runner_flags+=("$arg")
		;;
	--max=*)
		runner_flags+=("$arg")
		;;
	-t | --test-name-pattern)
		i=$((i + 1))
		test_pattern="${args[$i]:-}"
		if [[ -z "$test_pattern" ]]; then
			echo "usage: $0 <file> [-t <pattern>] [--headless|--tui]" >&2
			exit 1
		fi
		;;
	-*)
		echo "unknown option: $arg" >&2
		exit 1
		;;
	*)
		if [[ -z "$filename" ]]; then
			filename="$arg"
		elif [[ -z "$line" && "$arg" =~ ^[0-9]+$ ]]; then
			line="$arg"
		else
			echo "unexpected arg: $arg" >&2
			exit 1
		fi
		;;
	esac
	i=$((i + 1))
done

if [[ -z "$filename" ]]; then
	echo "usage: $0 <file> [line|-t pattern] [--headless|--tui]" >&2
	exit 1
fi

# Agents/CI usually lack a TTY — prefer the plain bun t headless runner.
if [[ $use_dispatcher -eq 0 && ! -t 1 ]]; then
	use_dispatcher=1
	runner_flags+=(--headless)
fi

if [[ "$filename" == *"shell"* ]]; then
	"$filename" "${@:2}"
elif [[ "$filename" == *".test.ts" ]]; then
	if [[ -n "$line" && "$line" =~ ^[0-9]+$ ]]; then
		test_name="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$filename" "$line")"
		NODE_ENV=development ENV_FILE=.env infisical run --env=dev --recursive -- \
			bun test --timeout 0 "$filename" -t "$test_name"
	elif [[ -n "$test_pattern" ]]; then
		NODE_ENV=development ENV_FILE=.env infisical run --env=dev --recursive -- \
			bun test --timeout 0 "$filename" -t "$test_pattern"
	elif [[ $use_dispatcher -eq 1 ]]; then
		# bun t path: retries + headless/TUI summary (no Ink redraw spam in agent logs)
		cd "$repo_root"
		NODE_ENV=development ENV_FILE=.env infisical run --env=dev --recursive -- \
			bun "$repo_root/scripts/testScripts/testDispatcher.ts" "$filename" "${runner_flags[@]}"
	else
		NODE_ENV=development ENV_FILE=.env infisical run --env=dev --recursive -- \
			bun test --timeout 0 "$filename"
	fi
elif [[ "$filename" == *".sh"* ]]; then
	"$filename"
else
	# Regular scripts (preload configured in bunfig.toml allows .env to override Infisical)
	ENV_FILE=.env infisical run --env=dev --recursive -- bun "$filename"
fi
