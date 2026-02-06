# Migration Tests Plan

Migration is a **dangerous operation** that updates customers from one product version to another. We need comprehensive test coverage to ensure:
1. Usage/balances are carried over correctly
2. No unexpected charges occur
3. Edge cases are handled safely

---

## Test File Structure

```
migrations/
├── plan.md                           # This file
├── migrate-free.test.ts              # Free → Free migrations ✅
├── migrate-errors.test.ts            # Error cases and validation
├── migrate-paid.test.ts              # Paid → Paid migrations (NO CHARGES)
├── migrate-trials.test.ts            # Trial state preservation
├── migrate-states.test.ts            # Cancel/downgrade state preservation
├── migrate-addons.test.ts            # Add-on product migrations
├── migrate-entities.test.ts          # Per-entity migrations
├── migrate-custom-plans.test.ts      # Custom plans should be SKIPPED
└── migrate-batch.test.ts             # Batch migration behavior
```

---

## Test Scenarios by File

### 1. `migrate-free.test.ts` ✅ (DONE - 5 tests)

Free products have no Stripe subscription, so migrations only update customer entitlements.

| Test | Scenario | Expected |
|------|----------|----------|
| ✅ 1 | Increase included usage with existing usage | Balance recalculated, usage carried over |
| ✅ 2 | Decrease included usage | Balance recalculated |
| ✅ 3 | Multiple features (messages + words) | All features updated correctly |
| ✅ 4 | No usage tracked | Clean state transition |
| ✅ 5 | Usage exceeds new included (overage) | Balance goes negative (free so no charge) |

---

### 2. `migrate-errors.test.ts`

Error cases and validation.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Free → Paid migration | Error |
| 2 | From one-off product | Error: "cannot migrate customers on/to it" |
| 3 | To one-off product | Error: "cannot migrate customers on/to it" |
| 4 | New product has prepaid feature old doesn't | Error: "can't perform migration" |

---

### 3. `migrate-paid.test.ts` (CRITICAL: NO CHARGES)

Paid products with Stripe subscriptions. **Key behavior: NO CHARGES during migration.**

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Consumable: usage + price change | Usage carried over, NO charges |
| 2 | Allocated: seats + price change | Seats preserved, NO proration |
| 3 | Base price change ($20 → $50) | NO charges (migration doesn't bill) |
| 4 | Mid-cycle migration | NO proration |
| 5 | Feature added in v2 | Works, no charges |
| 6 | Feature removed in v2 | Works, customer loses access |
| 7 | Prepaid → Pay per use | Quantity preserved, NO charges |

---

### 4. `migrate-trials.test.ts`

Trial state preservation during migration.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Mid-trial migration (day 3/7) | Trial days remaining SAME |
| 2 | Advance clock mid-trial, migrate | Trial end date UNCHANGED |
| 3 | Advance past trial end, migrate | Customer NOT on new trial |
| 4 | Existing paid customer, v2 adds trial | Customer does NOT get trial |

---

### 5. `migrate-states.test.ts`

Cancellation and downgrade state preservation.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Pending cancellation | Stays cancelled after migration |
| 2 | Scheduled downgrade | Schedule preserved after migration |

---

### 6. `migrate-addons.test.ts`

Add-on product migrations.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Migrate add-on only | Main product UNTOUCHED |
| 2 | Migrate main only | Add-ons UNTOUCHED |

---

### 7. `migrate-entities.test.ts`

Per-entity migrations with multiple entities.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | e1: Pro, e2: Pro | Both migrated correctly |
| 2 | e1: active, e2: cancelled | States preserved per entity |

---

### 8. `migrate-custom-plans.test.ts`

Custom plans should be SKIPPED during migration.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Customer with `is_custom = true` | SKIPPED (not migrated) |
| 2 | Batch with mix of custom and regular | Only regular migrated |

---

### 9. `migrate-batch.test.ts`

Batch migration behavior.

| Test | Scenario | Expected |
|------|----------|----------|
| 1 | Batch migration stops on first failure | Entire batch halts |
| 2 | Multiple customers, all valid | All migrated correctly |

---

## Key Behaviors to Remember

1. **Usage Carryover**: Usage is always preserved during migration
2. **NO CHARGES**: Migrations should NEVER create new charges/invoices
3. **Trial Preservation**: Trial end dates must be preserved, not reset
4. **State Preservation**: Cancellations and scheduled downgrades preserved
5. **Custom Plans**: Always SKIPPED, never migrated
6. **Batch Failure**: Stops entire batch on first error

---

## Implementation Notes

### Product ID Pattern
Products are prefixed with `customerId` by `initScenario`:
```typescript
// After initScenario, use free.id directly (already prefixed)
await autumnV1.products.update(free.id, { items: v2Items });
```

### Migration Wait Time
Migrations are async jobs. Use helper:
```typescript
const waitForMigration = (ms = 5000) =>
  new Promise((resolve) => setTimeout(resolve, ms));
```
