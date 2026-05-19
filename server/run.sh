#!/bin/bash
# Run current file
filename="$1"
line="$2"

if [[ "$filename" == *"shell"* ]]; then
    "$filename" "${@:2}"
elif [[ "$filename" == *".test.ts" ]]; then
    repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

    if [[ -n "$line" && "$line" =~ ^[0-9]+$ ]]; then
        # Targeted: run only the test enclosing the given line.
        test_name="$(bun "$repo_root/scripts/testScripts/getDescribeAtCursor.ts" "$filename" "$line")"
        NODE_ENV=development infisical run --env=dev --recursive -- bun test --timeout 0 "$filename" -t "$test_name"
    else
        # Test files: use bun test (preload configured in bunfig.toml)
        NODE_ENV=development infisical run --env=dev --recursive -- bun test --timeout 0 "$filename"
    fi
elif [[ "$filename" == *".sh"* ]]; then
    "$filename"
else
    # Regular scripts (preload configured in bunfig.toml allows .env to override Infisical)
    infisical run --env=dev --recursive -- bun  "$filename"
fi

# OLD: Using scripts/test.ts for test file matching (deprecated)
# elif [[ "$filename" == *"/tests/"* ]]; then
#     # Extract everything after "/tests/"
#     path_after_tests=$(echo "$filename" | sed 's/.*\/tests\///')
#     # Remove .ts extension if present
#     path_after_tests="${path_after_tests%.ts}"
#     # Use scripts/test.ts which auto-detects framework
#     NODE_ENV=development infisical run --recursive --env=dev -- bun ../scripts/test.ts "$path_after_tests"
