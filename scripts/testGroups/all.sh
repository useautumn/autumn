#!/bin/bash
source "$(dirname "$0")/config.sh"

BUN_PARALLEL_V2 \
  'customers' \
  'stripe-webhooks' \
  'update-subscription'