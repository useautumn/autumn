#!/bin/bash
# Run current file
# npx tsx scripts/alex.ts
filename="$1"


# Check if the file path contains "shell"


if [[ "$filename" == *"shell"* ]]; then
    "$filename" "${@:2}"
elif [[ "$filename" == *"/tests/"* ]]; then
    # Extract everything after "/tests/"
    path_after_tests=$(echo "$filename" | sed 's/.*\/tests\///')
    # Remove .ts extension if present
    path_after_tests="${path_after_tests%.ts}"
    # Use scripts/test.ts which auto-detects framework
    bun ../scripts/test.ts "$path_after_tests"

elif [[ "$filename" == *".sh"* ]]; then
    "$filename"
else
    # NODE_ENV=development npx tsx $filename
    NODE_ENV=development bun "$filename"
fi

