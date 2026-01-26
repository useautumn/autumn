#!/bin/bash
# Run current file
filename="$1"

if [[ "$filename" == *"shell"* ]]; then
    "$filename" "${@:2}"
elif [[ "$filename" == *".test.ts" ]]; then
    # Test files: use bun test (preload configured in bunfig.toml)
    NODE_ENV=development infisical run --env=dev -- bun test --timeout 0 "$filename"
elif [[ "$filename" == *".sh"* ]]; then
    "$filename"
else
    # Regular scripts (preload configured in bunfig.toml allows .env to override Infisical)
    infisical run --env=dev -- bun  "$filename"
fi

# OLD: Using scripts/test.ts for test file matching (deprecated)
# elif [[ "$filename" == *"/tests/"* ]]; then
#     # Extract everything after "/tests/"
#     path_after_tests=$(echo "$filename" | sed 's/.*\/tests\///')
#     # Remove .ts extension if present
#     path_after_tests="${path_after_tests%.ts}"
#     # Use scripts/test.ts which auto-detects framework
#     NODE_ENV=development infisical run --env=dev -- bun ../scripts/test.ts "$path_after_tests"

