#!/bin/bash
# Run current file
# npx tsx scripts/alex.ts
filename="$1"



if [[ "$filename" == *"shell"* ]]; then
    "$filename" "${@:2}"
elif [[ "$filename" == *"/tests/"* ]]; then
    # Extract everything after "/tests/"
    path_after_tests=$(echo "$filename" | sed 's/.*\/tests\///')
    # Remove .ts extension if present
    path_after_tests="${path_after_tests%.ts}"
    # Use scripts/test.ts which auto-detects framework
    NODE_ENV=development infisical run --env=dev -- bun ../scripts/test.ts "$path_after_tests"

elif [[ "$filename" == *".sh"* ]]; then
    "$filename"
elif [[ "$filename" == *"/scripts/"* ]]; then
    # Run scripts with infisical prod environment
    infisical run --env=prod -- bun "$filename"
else
    infisical run -- bun "$filename"
fi

