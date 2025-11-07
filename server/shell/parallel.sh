#!/bin/bash

# Parallel Test Runner
# Runs all test groups in parallel, each with its own dedicated org

# Source shared configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Check for required environment variables
if [ -z "$TEST_ORG_SECRET_KEY" ]; then
  echo "Error: TEST_ORG_SECRET_KEY environment variable is required"
  echo ""
  echo "This should be the secret key of your platform organization"
  echo "that has access to create/delete test organizations."
  echo ""
  echo "Add it to your server/.env file:"
  echo "  TEST_ORG_SECRET_KEY=am_sk_test_..."
  exit 1
fi

# Run parallel test groups
echo "Starting parallel test runner..."
cd "$PROJECT_ROOT" && $BUN_CMD server/tests/testRunner/runParallelGroups.ts
