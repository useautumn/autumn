# Core attach tests

source "$(dirname "$0")/config.sh"

BUN_PARALLEL_COMPACT \
  'server/tests/attach/basic' \
  'server/tests/attach/entities' \
  'server/tests/attach/upgrade' \
  'server/tests/attach/downgrade' \
  'server/tests/attach/free' \
  'server/tests/attach/addOn' \
  'server/tests/attach/checkout' \
  'server/tests/attach/misc' \
  --max=6 \
