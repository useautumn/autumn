#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e

BUN_PARALLEL_V2 \
  'attach/new-plan' \
  'attach/immediate-switch' \
  'attach/scheduled-switch' \
  'attach/free-trial'

