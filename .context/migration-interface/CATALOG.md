# Catalog: Migration & Import Patterns

Source: 4-agent parallel discovery on 2026-04-29 covering `scripts/src/common/migrations/`, `scripts-v2/runs/`, `scripts/mintlify-import.sh` chain, `scripts/firecrawl-import-from-csv.sh` chain, plus a deep read of billing v2 action machinery.

---

## A. Migration archetypes (what scripts actually do)

### A1. Version bump via `billingActions.migrate()`
- `scripts/src/common/migrations/perform-migration.ts`, `lingo.ts`, `lingo-prepaid-to-payperuse.ts`
- `scripts-v2/runs/browser-use/migrate-free/` (uses `billingActions.migrate` with `noBillingChanges: true`)
- Trivially fits `{ customerId, plans: [{ expire: cusProductId, insert: { productId, version } }] }`.
- Note: scripts loop multiple matching cusProducts per customer and reload state mid-loop because `migrate()` mutates state.

### A2. Multi-cusProduct subscription update — **the canonical complex case**
- `scripts-v2/runs/mintlify/migrate-credits/multi-update/` — replaces legacy AI-credits prepaid with V2 prepaid+consumable across N cusProducts sharing one Stripe sub.
- Operates on `CusProductGroup = { subscriptionId, cusProducts[] }`.
- Per group: `setupStripeBillingContext` once → per-product `computeCustomPlanNewCustomerProduct` → aggregate into `AutumnBillingPlan` → `evaluateStripeBillingPlan` → `executeBillingPlan`.
- This is structurally ~95% of the proposed interface, coupled to AI-credits-specific helpers (`resolveAiCreditsQuantity`, `setupUpdateFullProductContext`).

### A3. Pricing-shape swap, cusProduct identity preserved
- `scripts/src/common/migrations/firecrawl-credit-pack-to-usage-price.ts`
- Keeps the same `customer_product_id`, replaces its child cus_ents/cus_prices with custom rows. Preserves balance/reset/expiry.
- **Does NOT fit `{expire, insert}`** — cusProduct stays.

### A4. 1→N cusProduct split
- `scripts/src/common/migrations/split-one-cus-product-into-two.ts` (Email → Domain + Inbox).
- Expires one cusProduct, inserts N new ones referencing the SAME `subscription_ids`.
- Fits `{ expire, insert: [...] }` only if interface explicitly supports shared subscription_ids and balance/option carryover per inserted plan.

### A5. Flag-flip / balance-clamp on existing rows
- `cont-use-to-single-use.ts`, `fix-creator-connections-interval.ts`, `browser-use-reset-spam-users.ts`, `additive-entitlement-migration.ts` (gifting branch), `retroactively-add-plan-item-to-customers.ts` "update" mode.
- Pure UPDATE on `entitlements` / `customer_entitlements`. No cusProduct churn, no Stripe.
- **Does not fit `{expire, insert}` at all** — separate primitive.

### A6. Raw-DB bulk replace (no Stripe, no billing v2)
- `scripts-v2/runs/sebipaps/sandbox-product-sync/migrate-plan.ts` — chunked `delete cus_ent + delete cus_price + update cusProduct.internal_product_id`.
- Free-tier or 1:1 product remap. Bypasses billing v2 entirely.
- Should be subsumed by a "DB-only bulk swap" mode of the unified interface.

---

## B. Catalog-prep archetypes (what runs BEFORE migrations)

These are *preparation* patterns — extending the product catalog so a migration can land.

### B1. Add entitlement (+optional price) to all versions of a product
- `retroactively-add-plan-item-to-versions.ts` — uses latest version that already has the ent as a TEMPLATE, clones onto older versions.
- `FINAL-add-entitlement-to-plans.ts` — adds feature to all versions matching id-prefix.
- `add-creator-connections-entitlement.ts`, `add-boolean-customer-entitlement.ts`, `add-feature-to-customers.ts`, `add-new-boolean-feature.ts`.
- Pure catalog (`entitlements`, `prices`) mutations. No customer-side touch.

### B2. Backfill cus_ents for existing customers on extended products
- `retroactively-add-plan-item-to-customers.ts` — sibling of B1; per active cusProduct on listed products, insert missing `customer_entitlements` (and raw `customer_prices` if `requirePrice`).
- `add-creator-connections-cus-entitlement.ts`, `add-boolean-customer-entitlement.ts` (also does B1).
- Uses `initCusEntitlement` + direct `CusEntService.insert`. **Zero scripts use** `createFullCusProduct`.

### B3. Catalog clone (sandbox → live, or version bump)
- `scripts-v2/runs/sebipaps/sandbox-product-sync/copy-products.ts` — `handleCopyFeatures`, `handleVersionProductV2`, `createProduct`.
- `scripts-v2/runs/mintlify/migrate-credits/steps/init-plan-resources/` — deterministic-id init for V2 prepaid/consumable price+entitlement; sibling entrypoint `setup-credits-catalog.ts`.
- Pattern: prep entrypoint shares folder + `data/` with the migration entrypoint.

### B4. Stripe-side prep (clone archived Stripe prices)
- `scripts-v2/runs/mintlify/fix-archived-price/` — clones archived Stripe prices, updates `Price.config.stripe_price_id`, then patches subscription items.
- Doesn't fit `{expire, insert}` — it's a price-id swap on the same cusProduct.

---

## C. Import patterns (Stripe → Autumn)

### C1. Mintlify import (`scripts/src/mintlify/import/`)
- Source: Mongo orgs/deployments/period_usage. Stripe customers/subs.
- Steps: create customers → create entities (per deployment) → attach base plans via `createFullCusProduct` → derive addons from Stripe subs → "loose" custom entitlements via direct Drizzle insert → sync period usage into balances → cleanup.
- Plan resolver: Mongo `plan` string field.
- Custom allowances: signature-deduped per-customer entitlement rows.

### C2. Firecrawl import (`scripts/src/firecrawl/import/`)
- Source: BigQuery `autumn_shared` (teams, orgs, balances, coupons). Stripe subs/prices/customers.
- Steps: select Stripe subs → resolve plan from `lookup_key` → resolve/create customer → ensure team entity → build target product state with per-customer overrides (custom allowance, custom topup price, signature dedup) → flush via `customerProductService.insertIfNotExists` → repair Stripe sub link → schedule end-of-cycle plan switches via `billingActions.attach` with `no_billing_changes: true` → sync team credit state → import coupon balances directly to `customer_entitlements.balance` with deterministic ids.
- Plan resolver: Stripe `price.lookup_key`.
- Custom allowances: per-customer freshly-created `entitlements` + `prices` rows with signature dedup cache.

### Cross-cutting import friction (top 5)
1. Stripe price → Autumn plan resolver is org-specific (Mongo field vs lookup_key vs price.metadata).
2. Per-customer catalog overrides require signature-deduped per-customer `entitlements`+`prices` rows.
3. Linking to existing Stripe sub (idempotent), not creating it. `initOptions.subscriptionId` + repair.
4. Balance carryover is a separate concern: deterministic `balanceId`, direct write to `customer_entitlements.balance`, bypass `createFullCusProduct`.
5. Entity scoping + duplicate cleanup (same Stripe sub re-attached to wrong entity, stale entities, duplicate plans across entities).

---

## D. Billing v2 architecture (the substrate)

### D1. The 5-stage pipeline (every action follows this)
```
setup<Action>BillingContext({ ctx, params })  -> <Action>BillingContext
handle<Action>Errors({ ctx, billingContext })  -> throws RecaseError
compute<Action>Plan({ ctx, billingContext })   -> AutumnBillingPlan
evaluateStripeBillingPlan({ ctx, billingContext, autumnBillingPlan }) -> StripeBillingPlan
executeBillingPlan({ ctx, billingContext, billingPlan }) -> BillingResult
```

### D2. AutumnBillingPlan already expresses every migration shape
- `insertCustomerProducts: FullCusProduct[]`
- `updateCustomerProduct(s)?: CustomerProductUpdate[]` — patch options/status/canceled/anchor/sub_ids
- `deleteCustomerProduct(s)?: FullCusProduct[]` — for scheduled product replacement
- `customPrices?: Price[]`, `customEntitlements?: Entitlement[]`, `customFreeTrial?`
- `updateByStripeScheduleId?` — for schedule swaps
- `insertCustomerEntitlements?`, `updateCustomerEntitlements?`
- `lineItems?`, `customLineItems?`
- `autoTopupRebalance`, `upsertSubscription`, `upsertInvoice`, `refundPlan`

### D3. evaluateStripeBillingPlan capabilities
- ✅ Multi-product, mixed prepaid/metered, schedules, cancel+replace, multi-entity, refunds, manual invoices.
- ✅ DB-only mode: `billingContext.skipBillingChanges = true` returns `{}` and execute no-ops Stripe.
- ⚠️ Single-customer per evaluation. No batch mode.

### D4. Existing `migrate` action
- `actions/migrate/migrate.ts` is already in the registry. Need to read what it actually does — likely the simple version-bump path; we may extend or replace.

### D5. Critical gap: shared custom rows
- `setupCustomFullProduct` always mints fresh per-customer `Price`/`Entitlement` rows when `hasCustomItems` is true.
- For bulk migration where 10k customers should share the same prepared price/ent rows, we need either:
  - A `prepared` mode that reuses existing catalog rows, OR
  - A separate one-shot prep phase that creates the shared rows once, with the migration action only inserting `customer_products` + `customer_prices`/`customer_entitlements` referencing those existing IDs.

### D6. customizePlanV1 is PUT-style
- `items?: ApiPlanItemV1[]` — when provided, replaces full list.
- For migrations we want PATCH-style (incremental add/remove/update of plan items).

---

## E. Verdict on `{ customerId, plans: [{ expire, insert }] }`

Fits cleanly: **A1, A2 (with subscription-group dimension), A4 (with shared sub_ids), A6 (with DB-only mode).**

Does NOT fit, needs separate primitive(s):
- **A3** — pricing-shape swap on same cusProduct identity.
- **A5** — flag-flip / balance-clamp on existing rows.
- **B1, B2** — catalog prep & cus_ent backfill (different layer entirely).
- **B3** — catalog clone (different layer).
- **B4** — Stripe price-id swap (different layer).
- **C1, C2 imports** — need 5 additional dimensions on top of migration shape.

**Implication: the unified "migration interface" is really a layered system, not a single action.**
