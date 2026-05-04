#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

ENV_FILE=.env infisical run --env=dev --recursive -- bun scripts/setup/link-test-stripe-account.ts \
  --org=unit-test-org \
  --account-id=acct_1TObjo5ch7bV1B9z \
  --clear-secret-key
