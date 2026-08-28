# Stripe price reuse finder

2026-08-27 · `john/stripe-price-reuse` · on `97faae499c`

When customize (or any init) needs a Stripe Price, find an Autumn price
row we already minted that is **the same definition**, copy its
`stripe_*` ids, then let the retrieve we already do reject a dead or
drifted Stripe object. Do not list Stripe. Do not search `stripe.prices`.

---

## The hole

```
A  billing.attach  Pro  customize.price $25
   new pr_A (is_custom)
   carryForward candidates = catalog only          ← getFull drops is_custom
   pricesAreSame($25, $20) = false
   mint price_A

B  same attach
   new pr_B
   same candidates
   mint price_B
```

`composeFullProductQuery` loads `prices.is_custom = false` only
(`composeFullProductQuery.ts:22`). The matcher is fine. The candidate
set is not.

`reuse-stripe-prices-custom-plan.test.ts` asserts customer vs **catalog**.
Nothing asserts A then B.

---

## What this function is

A third candidate source on the existing init path. Not a new matcher.

```
initStripeResourcesForProducts / ForBillingPlan
  applyStripeResourceReuseForProduct      in-memory catalog + caller candidates
  applyStripeReuseFromVariantFamilies     other versions / variants, catalog only
+ findReusableStripeResourcesForProducts  DB: custom siblings (and later versions)
  createStripePriceIFNotExist
    checkCurStripePrice retrieve          already paid; this is the validate
```

In-memory reuse stays first and free. The finder runs only for prices
that still miss a required slot (`priceHasMissingStripeResources`).

Miss → mint. The finder never blocks attach on Stripe HTTP.

---

## Not doing

- Stripe `prices.list` / Search / `stripe.prices` sync DB
- Replacing `getPriceStripeReuseLevel` / `pricesAreSame` / `entsAreSame`
- Copying `"stripeProductOnly"` (feature Product / meter already carry)
- Copying `product.processor.id` across different `product.id`s
- Entity-level prepaid (inline price)
- `$0` fixed (`shouldInitializeStripePrice`)
- lookup_key / concurrent A+B dedup (both miss, two mints — accept)
- Patch customize carry (`add_items` without `carryForward`) — later unit
- Org-wide “same price in general”

---

## Match — already written

`"full"` only. `getPriceStripeReuseLevel` + `copyStripeResourcesToMatchingPrice`.

Hard filters (all must pass):

| gate | already |
|---|---|
| org + env | product join |
| not self | `price.id` |
| usable stripe id | non-null, not preview |
| same `config.type` | fixed ≠ usage |
| `pricesAreSame` | amount, interval, interval_count, bill_when, billing_units, feature ids, tiers, proration, allocated behavior, currencies |
| usage: `entsAreSame` | feature, allowance, interval, entity_feature_id, pooled, usage_limit, rollover |
| currency slot | the attach currency’s `stripe_*` id |

`pricesAreSame` treats add/remove of a catalog currency as compatible
(versioning). For reuse that may be too loose — see **open**.

---

## Query — one batched read

Not per price. Collect every target still missing a slot, one `WHERE
internal_product_id IN (...)`.

`prices.internal_product_id` is indexed. `config.internal_feature_id`
is indexed for usage.

```
listStripeReuseCandidatePrices({ ctx, internalProductIds, excludePriceIds })
  prices
    join products   org_id, env, id, internal_id, processor
    left join ents  on prices.entitlement_id
  where
    products.org_id = ctx.org.id
    products.env    = ctx.env
    prices.internal_product_id IN (...)
    prices.id NOT IN exclude
    stripe_price_id present          (or the slot we actually need)
    not preview prefix
  order by
    is_custom ASC,                   catalog first
    created_at ASC
  limit 100
```

SQL prefilter (false negative OK, false positive not):

- fixed: `config->>'amount'`, `config->>'interval'`
- usage: `config->>'feature_id'`, `config->>'bill_when'`, interval

Tiers stay in memory. `getPriceStripeReuseLevel === "full"` is the
source of truth.

**Unit 1 scope = same `internal_product_id` only.** Same `product.id`
(other versions) and variant family already have a catalog-only path.
Custom-across-versions is unit 3 if we still want it.

Load the paired entitlement. `"full"` for usage needs `entsAreSame`.
`getFull` will not have given us custom ents.

---

## Rank

`copyStripeResourcesToMatchingPrice` takes the first `"full"` in array
order. Sort, then pass `[winner]`.

```
1. is_custom = false
2. same Stripe Product
     fixed → product.processor.id
     usage → candidate.config.stripe_product_id
             vs target / feature.stripe_product_id / plan processor
     (if target has no product id yet, this key is a tie)
3. same product.id
4. same internal_id
5. oldest created_at
```

Never copy plan `processor.id` from a different `product.id`
(migrations already set `reuseProcessor: false`).

---

## Validate — no extra HTTP

After we stamp a borrowed id, `checkCurStripePrice` already retrieves it.

```
own id + active + shape ok        reuse
own id + !active + shape ok       reactivate (today)
borrowed + !active                skip, mint
any + currency mismatch           skip, mint (today)
any + !stripePriceShapesEqual     skip, mint   ← new, kills drift
```

Borrowed = `PriceService.getByStripeId` owner is not the target row.
Own-row inactive can still reactivate. Borrowed inactive cannot.

---

## Shape

```
server/src/internal/products/stripeResourceUtils/findReusableStripeResources/
  findReusableStripeResourcesForProducts.ts   orchestrator
  findReusableStripeResources.ts              one target → winner | null
  listStripeReuseCandidatePrices.ts           one query
  rankStripeReuseCandidates.ts                pure sort

shared/utils/productUtils/priceUtils/match/
  getPriceStripeReuseLevel.ts                 unchanged
  copyStripeResourcesToMatchingPrice.ts       unchanged
```

```ts
findReusableStripeResourcesForProducts({ ctx, products }): Promise<void>
findReusableStripeResources({
  targetPrice,
  targetEntitlements,
  targetProduct,
  candidates,
}): Price | null
```

Orchestrator reads as:

```
missing = prices still missing a slot
if none: return
candidates = listStripeReuseCandidatePrices(...)
for each missing:
  winner = findReusableStripeResources(...)
  if winner: copyStripeResourcesToMatchingPrice({ candidatePrices: [winner] })
  persist config if the row exists
```

Customize rows are often not in the DB yet (insert is execute). Stamp
in memory; `PriceService.update` is a no-op until the row exists.
`createStripePriceIFNotExist` then sees the stamped id and retrieves.

---

## Latency

- 0 queries when every price already has its slot (catalog attach)
- 1 indexed query when something is missing
- 0 new Stripe HTTP (retrieve is already in `checkCurStripePrice`)
- `LIMIT 100` after amount/interval prefilter
- skip the finder if Stripe writes are disabled / no Stripe account

---

## Units

### 1 · [ ] finder + matrix (no attach)

**goal** — one function that is wrong-never, miss-ok
**steps** — list query · rank · `findReusableStripeResources` · unit matrix
**verify** — `bun test` the matrix file

**scenarios** — findReusableStripeResources
- A custom $25, B custom $25, same Pro, fixed
- A $25, B $20 catalog
- A $25 monthly, B $25 yearly
- A prepaid $25, B prepaid $25, same feature
- A prepaid $25, B consumable $25, same feature
- A messages $25, B seats $25
- USD $25 vs EUR $25
- preview `stripe_price_id`
- two matching custom rows → oldest, catalog beats custom
- other org / other `internal_product_id`
- usage ents differ (allowance / entity_feature_id)

**shape** — signatures above

### 2 · [ ] borrowed retrieve

**goal** — stamped id that is inactive or drifted does not land on a sub
**steps** — `checkCurStripePrice` borrowed / shape branches
**verify** — unit: inactive borrowed → mint; drifted amount → mint; own inactive + same shape → reactivate

### 3 · [ ] wire into init + attach customize

**goal** — A then B share `stripe_price_id`
**steps** — call finder after variant-family reuse in both init wrappers
**verify** — `bun t` new feature-products-style file: two customers, customize $25

**scenarios** — billing.attach customize
- Pro $20 catalog, A $25, B $25 · attach
- Pro $20, A $25, B $20 (no customize) · attach
- Pro + prepaid messages, A $10, B $10 · attach
- concurrent A+B $25 · attach (two mints OK)

### 4 · [ ] updateSubscription customize

**goal** — same finder, second action
**verify** — A attach $25, C updateSubscription to $25

---

## Open

- ? `pricesAreSame` currency compatibility vs `priceCurrencyDefinitionsAreSame` for reuse
- ? Unit 1 stays `internal_product_id` only, or same `product.id` in the first query
- ? `LIMIT 100` after prefilter — OK, or catalog-only subquery then custom
