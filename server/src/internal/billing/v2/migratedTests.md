# Migrated Tests

Tests that have been migrated from the legacy test style to the new `initScenario` style.

## Cancel Tests

| Legacy File | New Location | Description |
|-------------|--------------|-------------|
| cancel6.test.ts | integration/billing/update-subscription/cancel/cancel-end-of-cycle.test.ts | Downgrade then cancel end of cycle → verify premium canceling, scheduled removed. Re-attach → verify scheduled |
