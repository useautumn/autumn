# Plan: Overage-First Auto Top-Up (ATU Rebalance)

## Goal
When ATU fires, the `quantity` first pays down existing overage on top-level cusEnt balances, and only the remainder lands on the one-off prepaid cusEnt.

> **Critical safety property:** ATU runs asynchronously from the SQS worker. Between `setupAutoTopupContext` (snapshot) and `executeBillingPlan` (write), concurrent usage can mutate the real balance. Paydown updates are therefore emitted as **`balanceChange` deltas** (not absolute snapshot overwrites) so execution applies via atomic SQL `balance = balance + delta` and preserves any concurrent usage.

> **Entity-scoped cusEnts are excluded from paydown.** Entity balances live in a JSONB `entities` column with no race-safe atomic increment primitive today; applying a snapshot would hit the same P0 data-loss race. Any per-entity overage is left in place and flows through to the prepaid remainder as if the entity-scoped cusEnt had no overage at all. Adding safe entity paydown is a separate follow-up that requires JSONB-path atomic updates.

### Example
- **Before**: base `-500 / 1000` (overage), prepaid `0 / 0`, combined `-500 / 1000`
- **ATU fires** with `quantity = 600`
- **After**: base `0 / 1000`, prepaid `100 / 100`, combined `100 / 1100`

The customer is still charged for the full 600, but on the autumn side the 500 that paid down overage stays in the monthly allowance (where it belongs and naturally rolls away at renewal), and only the net-new 100 becomes prepaid credit.

## Current Behavior (for context)
- `computeAutoTopupPlan.ts` finds exactly one cusEnt for the feature: the one-off prepaid (`isOneOffPrice && isPrepaidPrice && !isVolumeBasedCusEnt`).
- Emits a single `updateCustomerEntitlements` entry with `balanceChange: +quantity` targeting that cusEnt.
- Base reset-cycle cusEnt is never touched — overage sits as-is until the monthly resets.
- Post-ATU the customer is left with a split-entitlement state: `base -500/1000` + `prepaid 600/600` = combined `100/1600`.

## Files to touch

### 1. `server/src/internal/balances/track/deductUtils/deductFromCusEntsTypescript.ts`
- Add `export` keyword to `runDeductionPass` (line 97). No other changes.

### 2. `server/src/internal/balances/autoTopUp/helpers/fullCustomerToAutoTopupObjects.ts`
Extend return object:
```ts
return {
  autoTopupConfig,
  customerEntitlement,              // the one-off prepaid cusEnt (unchanged)
  customerEntitlements: cusEnts,    // NEW — all cusEnts for this feature
  balanceBelowThreshold,
};
```

### 3. `server/src/internal/balances/autoTopUp/autoTopupContext.ts`
Add `customerEntitlements: FullCusEntWithFullCusProduct[]` to the `AutoTopupContext` interface.

### 4. `server/src/internal/balances/autoTopUp/setup/setupAutoTopupContext.ts`
Populate the new `customerEntitlements` field in the returned context from the `resolved` object.

### 5. New file: `server/src/internal/balances/autoTopUp/compute/rebalanceAutoTopUpOverages.ts`

Pure function. Responsibilities:
1. Filter `customerEntitlements` to exclude:
   - The prepaid one-off cusEnt (paydown target can't consume itself).
   - Boolean and unlimited cusEnts (no mutable numeric balance).
   - **Entity-scoped cusEnts** — see "Safety properties" below.
2. Sort the remaining cusEnts: `usage_allowed: true` first (matches deductor's pass-2 sort), fall back to `created_at` ascending (oldest first).
3. Prepare empty `updates: DeductionUpdates` and `mutationLogs: MutationLogItem[]` accumulators.
4. Call `runDeductionPass` once with:
   - `cusEnts: sortedOverageCusEnts`
   - `amountToDeduct: -quantity` (negative = refund)
   - `minBalance: undefined`, `maxBalance: 0` (paydown ceiling)
   - `updates`, `mutationLogs` passed in
5. **Discard** `mutationLogs` — ATU doesn't emit mutation logs today, keep that behavior.
6. Compute `remainder = Math.abs(result.amountToDeduct)`.
7. Convert the `updates` map entries into `UpdateCustomerEntitlement[]` using the **delta shape** (`balanceChange`), NOT the snapshot shape:
   ```ts
   {
     customerEntitlement: <the cusEnt>,
     balanceChange: -update.deducted, // refund passes record `deducted < 0`; negate to get a positive delta
   }
   ```
   This routes to `adjustBalanceDbAndCache` → `CusEntService.increment` (atomic `balance + X` SQL) at execution time. Using the snapshot shape (`updates: { balance: X }`) would route to `updateDbAndCache` and overwrite the live balance, which is unsafe under concurrent usage.
8. Return `{ paydownUpdates, remainder }`.

Signature:
```ts
export const rebalanceAutoTopUpOverages = ({
  customerEntitlements,
  prepaidCustomerEntitlement,
  quantity,
}: {
  customerEntitlements: FullCusEntWithFullCusProduct[];
  prepaidCustomerEntitlement: FullCusEntWithFullCusProduct;
  quantity: number;
}): {
  paydownUpdates: UpdateCustomerEntitlement[];
  remainder: number;
};
```

### Safety properties

- **Race-safety (P0).** Paydown updates are always `balanceChange` deltas. Execution applies them via SQL `balance = balance + delta`, which preserves any concurrent usage that happened between the snapshot and the write.
- **Scope of what's touched.** Only top-level numeric balances of non-prepaid, non-boolean, non-unlimited, non-entity-scoped cusEnts. Everything else is left untouched; the full top-up remainder flows to prepaid.
- **Entity-scoped exclusion.** Today there is no race-safe per-entity increment primitive (entity balances are stored in a JSONB map). Snapshot-style updates to entities would re-introduce the P0 race. Entity-scoped cusEnts are therefore filtered out of paydown until a JSONB-path atomic update primitive exists.

### 6. `server/src/internal/balances/autoTopUp/compute/computeAutoTopupPlan.ts`
Between section A (convert to packs) and section B (build line item), insert:
```ts
const { paydownUpdates, remainder } = rebalanceAutoTopUpOverages({
  customerEntitlements: autoTopupContext.customerEntitlements,
  prepaidCustomerEntitlement: customerEntitlement,
  quantity,
});
```

Update section C (`autumnBillingPlan`):
```ts
updateCustomerEntitlements: [
  ...paydownUpdates,
  ...(remainder > 0
    ? [{ customerEntitlement, balanceChange: remainder }]
    : []),
],
```

**Unchanged:**
- Line item (`lineItem.amount <= 0` guard, `usagePriceToLineItem`, Stripe invoice action) — customer still charged full `quantity × unit_price`.
- `options.quantity += topUpPacks` — purchase ledger still records full purchase.
- `inlineCusEnt` / `updateCusEntOptionsInline` usage for line-item context.

## Behavior Matrix

| # | Pre-state | quantity | Post-state |
|---|-----------|----------|------------|
| 1 | base `-500/1000`, prepaid `0/0` | 600 | base `0/1000`, prepaid `100/100` |
| 2 | ~~entity-scoped base `{A:-100, B:-100}`~~ | ~~300~~ | **Excluded from paydown** — entity-scoped overage is left in place and the full 300 flows to prepaid. Supporting safe entity paydown requires JSONB-path atomic updates (future work). |
| 3 | ~~entity-scoped base `{A:-100, B:-100}`~~ | ~~150~~ | Same exclusion as row 2. Full 150 goes to prepaid. |
| 4 | base `+200/1000`, prepaid `50/50` | 600 | base unchanged, prepaid `650/650` |
| 5 | base `-1000/1000`, prepaid `0/0` | 600 | base `-400/1000`, prepaid unchanged |
| 6 | base `-500/1000` snapshot → `-700` live at exec time, prepaid `0/0` | 600 | base `-200/1000` (live -700 + delta +500), prepaid `100/100`. **P0 race-safety: concurrent usage is preserved.** |

## Detailed Test Cases (for TDD)

Integration tests live in `server/tests/integration/balances/auto-topup/auto-topup-rebalance.test.ts`. Each test uses the standard ATU scaffolding (`initScenario`, `makeAutoTopupConfig`, `AUTO_TOPUP_WAIT_MS`).

### Common setup pattern

- **Base product** (`products.base`) with `items.lifetimeMessages({ includedUsage: 1000 })` — gives a non-priced cusEnt with `1000` allowance that can go negative when overage is enabled. Lifetime (null reset) avoids reset-interval interference during the test window.
- **Prepaid product** (`products.oneOffAddOn`) with `items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 })` — gives the ATU-target one-off prepaid cusEnt on the same feature.
- Attach both. Enable `overage_allowed` on `TestFeature.Messages` via `setCustomerOverageAllowed`.
- Drive the base cusEnt into overage via `autumnV2_1.track()`.
- Configure ATU with threshold and quantity via `makeAutoTopupConfig`.
- Fire one final `track` that crosses the threshold; `await timeout(AUTO_TOPUP_WAIT_MS)` for SQS processing.

### Test 1 — "rebalance-1: paydown + remainder goes to prepaid"
- **Pre**: base used to `-500` balance (500 overage), prepaid at `0/0` (attached with `quantity: 0` initially — we'll need prepaid to exist even if empty; may need to attach with `quantity: 1` then drain, or use a fresh attach path. See "Setup variant A" below).
- **ATU config**: threshold=0, quantity=600.
- **Trigger**: track enough usage to land at balance=0 or negative on base. Combined balance ≤ threshold triggers ATU.
- **Expected post-ATU**:
  - Base cusEnt balance = `0` (paid down)
  - Prepaid cusEnt balance = `100` (remainder)
  - Combined `remaining` = `100`
  - One new invoice created, total = `60` (600 credits / 100 billing_units = 6 packs × $10)
  - `customer_product.options.quantity` for prepaid = `initial + 6` (purchase ledger tracks full quantity)

### Test 2 — "rebalance-2: entity-scoped overage pays down per entity"
- **Pre**: base cusEnt is entity-scoped; entity A has `-100`, entity B has `-100`. Prepaid at `0`.
- **ATU config**: threshold=0, quantity=300.
- **Trigger**: track usage per entity to drive each into overage.
- **Expected post-ATU**:
  - Entity A balance = `0`
  - Entity B balance = `0`
  - Prepaid balance = `100`
  - Combined remaining = `100`

**Note on entity scoping**: This requires an entity-scoped feature setup. If entity-scoping infrastructure is complex to arrange in an auto-topup test, we may have to stub at a lower level. The core paydown logic is identical (`deductFromMainBalance`'s CASE 2 handles the entities dict), so the test primarily verifies wiring.

### Test 3 — "rebalance-3: insufficient top-up leaves partial overage, no prepaid increment"
- **Pre**: entity A `-100`, entity B `-100`, prepaid `0`.
- **ATU config**: threshold=0, quantity=150.
- **Expected post-ATU**:
  - Entity A = `0` (first in iteration order, fully paid)
  - Entity B = `-50` (partially paid)
  - Prepaid unchanged at `0`
  - Combined remaining = `0` (overage still exists but reported as zero)
  - Invoice created with total = `15` (150 / 100 × $10; wait — 1.5 packs? billing_units=100 means we need integer packs. Will need to pick sizes that align with billing_units.)

**Revised sizing for test 3**: Use `billingUnits: 50` on prepaid so `quantity: 150 → 3 packs`. Entity A=-100, B=-100, top-up=150. A → 0 (paid 100), B → -50 (paid 50). Prepaid unchanged.

### Test 4 — "rebalance-4: no overage, remainder flows entirely to prepaid (backward compat)"
- **Pre**: base at `+200/1000` (positive, i.e. 800 used out of 1000 allowance), prepaid `50/50`.
- **ATU config**: threshold=250, quantity=600. Combined is `250`, at threshold → triggers.
- **Expected post-ATU**:
  - Base unchanged
  - Prepaid = `50 + 600 = 650`
  - Combined remaining = `850`
- **This is the "equivalent to today" case** — makes sure we haven't broken the happy path.

### Test 5 — "rebalance-5: overage exceeds top-up, no remainder"
- **Pre**: base at `-1000` balance (after deducting 2000 on a 1000 allowance), prepaid `0`.
- **ATU config**: threshold=0, quantity=600.
- **Expected post-ATU**:
  - Base balance = `-400` (paid down 600 of 1000 overage)
  - Prepaid unchanged at `0`
  - Combined remaining = `0` (overage not exposed as negative remaining)
  - Invoice total = `60`

### Test 6 — "rebalance-6: options.quantity tracks FULL top-up, not just remainder"
- Piggyback on Test 1: verify `expectCustomerProductOptions` reports the full purchased packs regardless of how the quantity was split.
- **Pre**: base `-500/1000`, prepaid attached with initial pack count (e.g. 1 pack = 100 credits pre-drain).
- **ATU config**: threshold=0, quantity=600.
- **Expected**: `options.quantity` for prepaid = `initial_packs + 6` (full purchase), even though balance only got +100.

### Test 7 — "rebalance-7: multiple ATU cycles correctly handle overage each time"
- **Pre**: base `-200/1000`, prepaid `0`. Threshold=0, quantity=300.
- **Expected after 1st ATU**: base `0`, prepaid `100`.
- **Then**: track 500 more on base → base goes to `-400` (overage because usage_allowed). Combined drops below threshold again → 2nd ATU fires with quantity 300.
- **Expected after 2nd ATU**: base still `-100` (paid 300 of 400 overage), prepaid stays at `100` (no remainder).
- Verifies repeated ATU correctness, stable state transitions.

### Unit tests — `rebalance-auto-topup-overages.test.ts`
Pure-function unit tests that don't need integration scaffolding:
1. Empty cusEnts list → paydownUpdates=[], remainder=quantity.
2. No overage anywhere → skipped, remainder=quantity.
3. Single cusEnt at -500, quantity=600 → **`balanceChange: +500`**, remainder=100.
4. Single cusEnt at -1000, quantity=600 → **`balanceChange: +600`**, remainder=0.
5. Prepaid cusEnt is filtered from paydown pool (paydown doesn't consume itself).
6. usage_allowed cusEnt sorts before non-usage_allowed.
7. Creation date tiebreaker: oldest cusEnt is touched first.
8. Entity-scoped cusEnt is **excluded** from paydown (full quantity flows to remainder).
9. Mixed pool: entity-scoped excluded, top-level still pays down normally.
10. **P0 regression**: paydown output shape is a delta — asserts `balanceChange` is set and `updates` is not. Simulates concurrent usage (live balance moved after snapshot) and verifies the applied result preserves the concurrent usage (snapshot -500, live -700, delta +500 → final -200, not 0).

Every test asserts the delta shape (`balanceChange`) and specifically confirms `updates` is `undefined` for race-safety.

## Setup variant A — initial prepaid state

To get a "prepaid at 0/0" starting state, we can either:
- Attach with `options: [{ feature_id: TestFeature.Messages, quantity: 1 }]` (1 pack = 100 credits) then drain to 0 via `track`.
- Or attach with `quantity: 0` if the attach flow allows it (may require `includedUsage: 0` + no initial pack purchase).

Choice depends on what the attach flow supports. Verified at implementation time.

## Edge cases
- **No overage** → `runDeductionPass` does nothing on a refund with `maxBalance: 0` when no cusEnt is negative. `paydownUpdates = []`, `remainder = quantity`. Identical to today's behavior.
- **Overage ≥ quantity** → `paydownUpdates` populated (top-level only), `remainder = 0`, no prepaid update emitted.
- **Prepaid cusEnt missing** → impossible, short-circuited at `fullCustomerToAutoTopupObjects`.
- **Entity-scoped cusEnt with overage** → **filtered out of paydown**. Overage remains; full quantity flows to prepaid.
- **NEW-approach per-entity rows (`internal_entity_id` set on the row, no JSONB map)** → these still look entity-scoped via `isEntityScopedCusEnt` (which checks `entity_feature_id`), so they are also excluded. Top-level balance fields on NEW-approach rows are not touched by this helper — an atomic row-level paydown for those rows is a future extension.
- **Rollovers** → untouched by paydown (same as today).
- **Concurrent usage between snapshot and execution** → handled correctly because paydown is a delta, not a snapshot.

## Risks
- Exporting `runDeductionPass` creates a second consumer of an internal helper. Low risk: function is pure, self-contained, narrow signature. Any future refactor of `deductFromCusEntsTypescript` needs to consider the ATU caller.
- The prepaid-cusEnt filter needs to be robust (by `cusEnt.id`) so we don't accidentally pay down into it.

## Not in scope
- Mutation logging for ATU paydown.
- Invoice/line-item changes.
- Entity-level ATU triggering.
- `options.quantity` semantic changes.
- Changes to the 2 existing `deductFromCusEntsTypescript` callers.
