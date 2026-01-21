# Cancel Tests Migration Guide

## Overview

This document tracks all cancel-related tests that need to be migrated to the new test style in `@server/tests/integration/billing/update-subscription/cancel/`.

The `cancel` field in `updateSubscriptionV0Params.ts` accepts:
- `"immediately"` - Cancel the subscription immediately
- `"end_of_cycle"` - Cancel at the end of the billing period
- `null` - Uncancel (renew) a canceling subscription

---

## Test Groups

### 1. `cancel-addon.test.ts`
Tests for canceling add-on products in various scenarios.

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| cancel-addon1.test.ts | integration/billing/cancel/add-ons/ | Cancel add-on end-of-cycle → verify add-on has canceled_at but still active, main sub not canceled | [ ] |
| cancel-addon2.test.ts | integration/billing/cancel/add-ons/ | Cancel add-on immediately → verify add-on removed, pro still active, refund invoice (-$20) | [ ] |
| cancel-addon3.test.ts | integration/billing/cancel/add-ons/ | Cancel usage add-on immediately with overage → verify final invoice ($500 usage - $20 refund) | [ ] |
| cancel4.test.ts | core/cancel/ | Cancel free add-on immediately → verify premium still attached | [ ] |
| mergedAddOn1.test.ts | merged/addOn/ | Cancel add-on end-of-cycle → advance clock → verify add-on removed | [ ] |
| mergedAddOn4.test.ts | merged/addOn/ | Cancel add-on immediately while scheduled product exists → verify scheduled preserved | [ ] |
| renew-addon1.test.ts | integration/billing/renew/ | Cancel add-on end-of-cycle, then re-attach (renew) → verify canceled_at is null | [ ] |

---

### 2. `cancel-immediately.test.ts`
Basic tests for canceling immediately (non-add-on products).

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| cancel-addon4.test.ts | integration/billing/cancel/add-ons/ | Cancel usage add-on with failed payment → verify invoice still created | [ ] |
| upgrade7.test.ts | attach/upgrade/ | Cancel immediately then attach premium → verify upgrade path | [ ] |
| mergedAddOn3.test.ts | merged/addOn/ | Cancel add-on immediately with entity → verify pro still active | [ ] |
| mergedAddOn5.test.ts | merged/addOn/ | Cancel add-on immediately with scheduled → advance clock → verify scheduled becomes active | [ ] |
| mergedGroup1.test.ts | merged/group/ | Cancel scheduled product from different group immediately → verify sub correct | [ ] |
| mergedGroup2.test.ts | merged/group/ | Cancel scheduled product from different group immediately | [ ] |

---

### 3. `cancel-trial.test.ts`
Cases for canceling a product when it's on a free trial.

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| basic7.test.ts | attach/basic/ | Cancel pro with trial immediately, re-attach (renewal flow) → verify no duplicate trial | [ ] |
| trial3.test.ts | merged/trial/ | Cancel trial at end of cycle → verify sub canceled. Renew → verify not canceled. Cancel immediately → verify sub status canceled | [ ] |
| mergedTrial4.test.ts | merged/trial/ | Cancel one entity's trial immediately on merged sub → verify other entity still trialing | [ ] |
| mergedTrial5.test.ts | merged/trial/ | Cancel end-of-cycle, cancel immediately, cancel last at end-of-cycle → verify trialing sub states | [ ] |

---

### 4. `stripe-cancelation.test.ts`
Cases where we test cancellation through Stripe CLI to verify webhooks sync correctly.

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| cancel5.test.ts | core/cancel/ | Cancel via `stripeCli.subscriptions.update(cancel_at_period_end: true)` → verify scheduled free appears. Renew via `cancel_at_period_end: false` | [ ] |
| basic3.test.ts | attach/basic/ | Cancel via Stripe CLI at period end → verify canceled_at set and free scheduled. Then cancel immediately via `subscriptions.cancel()` → verify only free remains | [ ] |

---

### 5. `cancel-entities.test.ts`
Cases for handling cancellations in multi-entity/merged subscription situations.

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| mergedCancel1.test.ts | core/cancel/ | Cancel end-of-cycle for entity 1, cancel end-of-cycle for entity 2 (on merged sub), then renew both entities | [ ] |
| mergedCancel2.test.ts | core/cancel/ | Cancel end-of-cycle for entity 1, cancel immediately for entity 2 → results in canceled sub | [ ] |
| mergedCancel3.test.ts | core/cancel/ | Cancel immediately for both entities → results in no subscription | [ ] |
| multiAttach3.test.ts | core/multiAttach/ | Multi attach trial products, transfer to entities, cancel one entity end-of-cycle, cancel another immediately → verify invoice total correct | [ ] |
| multiAttach4.test.ts | core/multiAttach/ | Multi attach annual products, transfer to entities, cancel entities (tests skipped after return statement) | [ ] |

---



### 7. `cancel-renew.test.ts` (Uncancel scenarios)
Cases for renewing/uncanceling a product that was previously scheduled to cancel (non-add-on).

| Legacy File | Location | Description | Status |
|-------------|----------|-------------|--------|
| cancel5.test.ts | core/cancel/ | Cancel via Stripe, then renew via Stripe (cancel_at_period_end: false) → verify uncancel works | [ ] |
| trial3.test.ts | merged/trial/ | Cancel trial, then re-attach → verify sub not canceled | [ ] |

---

## Not Migrating (Different Scope)

These tests involve cancel functionality but are primarily testing other features:

| Legacy File | Location | Description | Reason |
|-------------|----------|-------------|--------|
| migration7.test.ts | attach/migrations/ | Migration preserves cancellation state | Migration-specific test |
| migration8.test.ts | attach/migrations/ | Migration with entities (one canceled, one active) | Migration-specific test |
| update-while-canceling.test.ts | integration/billing/update-subscription/custom-plan/ | Update items while product is canceling | Already in new style |
| quantity-while-cancelling.test.ts | integration/billing/update-subscription/update-quantity/ | Update prepaid quantity while product is canceling | Already in new style |
| schedules-from-paid.test.ts | integration/billing/update-subscription/multi-product/ | Cancel entity then update another entity's items | Update subscription focus |
| schedules-free-to-paid.test.ts | integration/billing/update-subscription/multi-product/ | Cancel entity in free-to-paid scenario | Update subscription focus |
| update-trial-multi-product.test.ts | integration/billing/update-subscription/free-trial/ | Product canceling state checked during trial updates | Trial update focus |

---

## Progress Tracker

| Test File | Tests | Migrated | Deleted |
|-----------|-------|----------|---------|
| cancel-addon.test.ts | 7 | [ ] | [ ] |
| cancel-immediately.test.ts | 6 | [ ] | [ ] |
| cancel-trial.test.ts | 4 | [ ] | [ ] |
| stripe-cancelation.test.ts | 2 | [ ] | [ ] |
| cancel-entities.test.ts | 5 | [ ] | [ ] |
| cancel-consumable.test.ts | 2 | [x] | [x] cancel2.test.ts |
| cancel-renew.test.ts | 2 | [ ] | [ ] |

**Total Legacy Tests to Migrate: 28** (2 done)

---

## Notes

- Some tests appear in multiple categories (e.g., `cancel5.test.ts` tests both Stripe webhook sync AND renew/uncancel). They should be consolidated when migrating.
- `multiAttach4.test.ts` has a `return` statement that skips the cancel tests - may need investigation.
- Tests in `merged/` folder often test complex scenarios with entities and add-ons - may need to be split across multiple new test files.
- Add-on cancel tests have been consolidated into `cancel-addon.test.ts` to group all add-on specific scenarios together.
