# migration-interface Plan

## Phase 1: Catalog & Stress-Test (IN PROGRESS)
Goal: enumerate every migration/import pattern we've shipped, then check the proposed interface against each one. Output: a catalog doc with per-script summaries and "interface covers? / what breaks?" verdicts.

- Survey `scripts/src/common/migrations/` (retroactively-add-plan-item-to-customers, -to-versions, -plan-items, plus siblings)
- Survey `scripts-v2/runs/` migration scripts (mintlify migrate-credits is the canonical example)
- Survey `scripts/mintlify-import.sh` and `scripts/firecrawl-import.sh` import flows
- Categorize each script along axes:
  - DB-only vs DB + Stripe
  - Single-customer vs bulk
  - Plan transformation shape (add item / swap plan / change pricing / cancel-and-replace / schedule)
  - Custom per-customer overrides (rollover, lifetime balance, balance carryover)
  - Preparation step required (new prices/products created before migration)
- Verdict per script: covered by proposed interface? What's missing?

## Phase 2: Interface Design
- Lock the migration action signature(s) — likely one new `migrate` action alongside `multiAttach` and `createSchedule`
- Solve the "insert + customize" friction:
  - Move customize from PUT-style (full item list) to PATCH-style (incremental add/remove/update)
  - Decide: do migrations create new custom price/entitlement rows, or reuse a single per-plan row? (Stripe price/product creation is the binding constraint)
- Decide whether "preparation" (creating shared prices/entitlements ahead of migration) is a separate action or a step in the same one
- Validate design against catalog from Phase 1

## Phase 3: Implementation
- Build the action(s) under `autumn/server/src/internal/billing/v2/actions/`
- Tests: integration tests covering catalog scenarios from Phase 1
- Reuse `evaluateStripeBillingPlan`, `setupBillingContext` patterns from existing actions

## Phase 4: Migrate Existing Scripts
- Port mintlify migrate-credits to use the new action
- Port retroactively-add-plan-item-to-customers
- Each port validates the interface; refine as needed

## Phase 5 (stretch): Imports
- Extend or sibling action for Stripe→Autumn linkage
- Handle the hard cases: balance carryover for metered features, custom configurations (rollovers, lifetime balances), many-plans Stripe accounts
- Goal: collapse the bespoke mintlify-import.sh / firecrawl-import.sh logic

---

## Initial Design Sketch (from kickoff conversation)

**Scope of one call:** one customer, one Stripe subscription's worth of customer_products.

**Proposed shape:**
```ts
{
  customerId: string,
  subscriptionId?: string, // inferable from plans
  plans: [
    {
      expire?: { customer_product_id?: string; plan_id?: string; entity_id?: string },
      insert?: { plan_id: string; customize?: ... },
    }
  ],
  schedules?: [...] // future, optional
}
```

**Open questions:**
1. Customize: PATCH vs PUT — strongly leaning PATCH (incremental add/remove/update of plan items)
2. Custom prices: per-customer rows vs shared per-plan row reused across migrations (Stripe-side cost is the constraint)
3. Preparation step (creating shared prices/entitlements + backfilling onto prior plan versions and customer_products): part of this interface or a separate "prepare migration" action?
4. Mapping public `apiPlanItemV1` ↔ DB `price + entitlement` pair — how does the interface accept input?

## Architecture Notes
- Build on `evaluateStripeBillingPlan` — the Autumn-plan → Stripe-state mapper already handles schedules, multi-entity, mixed prepaid/metered. Don't reinvent.
- `customer.processor?.id` is Stripe customer ID (per autumn-operations-constraints rule). Watch the ID confusion.
- Stripe writes must respect: amount conversion via `atmnToStripeAmount`, idempotent price creation via `createStripePriceIFNotExist`, `proration_behavior: "none"` for surgical item changes.
- This is product code, not script code — full TypeScript discipline, no `as any`, full test coverage.
