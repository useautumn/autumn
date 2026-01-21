# Migrated Tests

Tests that have been migrated from the legacy test style to the new `initScenario` style.

## Cancel Tests

| Legacy File | New Location | Description |
|-------------|--------------|-------------|
| cancel6.test.ts | integration/billing/update-subscription/cancel/cancel-end-of-cycle.test.ts | Downgrade then cancel end of cycle → verify premium canceling, scheduled removed. Re-attach → verify scheduled |
| cancel8.test.ts | integration/billing/update-subscription/cancel/cancel-end-of-cycle.test.ts | Downgrade then cancel end of cycle (with default) → verify premium canceling, free default scheduled |
| cancel3.test.ts | integration/billing/update-subscription/cancel/cancel-immediately.test.ts | Cancel free product immediately → verify product removed |
| downgrade6.test.ts | integration/billing/update-subscription/cancel/cancel-immediately.test.ts | Cancel (expire) active product immediately → verify customer has free product |
| downgrade7.test.ts | integration/billing/update-subscription/errors/cancel-errors.test.ts | Cancel scheduled product immediately → should error |
| cancel7.test.ts | integration/billing/update-subscription/cancel/cancel-immediately.test.ts | Downgrade then cancel immediately → verify no products, no subscriptions |
| cancel9.test.ts | integration/billing/update-subscription/cancel/cancel-immediately.test.ts | Downgrade then cancel immediately (with default) → verify free default is active |
| cancel2.test.ts | integration/billing/update-subscription/cancel/cancel-consumable.test.ts | Cancel at period end with usage → advance clock → verify usage invoice correct |
| entity3.test.ts | integration/billing/update-subscription/cancel/cancel-consumable.test.ts | Cancel entity product with usage → verify correct final invoice |