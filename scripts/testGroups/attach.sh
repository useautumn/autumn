#!/bin/bash

# Source shared configuration
source "$(dirname "$0")/config.sh"

# Exit immediately if a command exits with a non-zero status
set -e

BUN_PARALLEL_V2 \
  'billing/attach/checkout' \
  'attach/edge-cases' \
  'attach/errors' \
  'attach/free-trial' \
  'attach/immediate-switch' \
  'attach/invoice' \
  'attach/new-plan' \
  'attach/params' \
  'attach/scheduled-switch' \


  