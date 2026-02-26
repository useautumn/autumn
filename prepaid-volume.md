```bash
bun test:integration \
  server/tests/unit/billing/invoicing/line-item-utils/volume-tiers-to-line-amount.test.ts \
  server/tests/unit/billing/invoicing/line-item-utils/tiers-to-line-amount.test.ts \
  server/tests/integration/billing/attach/new-plan/attach-prepaid-volume.test.ts \
  server/tests/integration/billing/attach/new-plan/attach-prepaid-volume-entities.test.ts \
  server/tests/integration/billing/attach/new-plan/new-prepaid.test.ts \
  server/tests/integration/billing/attach/immediate-switch/immediate-switch-prepaid-volume.test.ts \
  server/tests/integration/billing/attach/immediate-switch/immediate-switch-entities-prepaid-volume.test.ts \
  server/tests/integration/billing/attach/scheduled-switch/scheduled-switch-prepaid-volume.test.ts \
  server/tests/integration/billing/attach/edge-cases/v1-v2-compatibility/prepaid/attach-prepaid-volume-edge-cases.test.ts \
  server/tests/integration/billing/attach/checkout/stripe-checkout/stripe-checkout-prepaid.test.ts \
  server/tests/integration/billing/update-subscription/update-quantity/volume-tiers-update-quantity.test.ts \
  server/tests/integration/billing/update-subscription/custom-plan/update-paid-tier-behavior.test.ts \
  server/tests/integration/billing/legacy/attach/new/legacy-new-volume.test.ts \
  server/tests/integration/crud/plans/create-plan-advanced.test.ts \
  server/tests/integration/crud/plans/get-plan-advanced.test.ts \
  server/tests/integration/balances/check/check-prepaid.test.ts \
  server/tests/integration/balances/check/check-balance-price.test.ts \
  server/tests/integration/billing/attach/v2-params/v2-customize.test.ts \
  --timeout 0
```
