# Rate card dimensions

2026-09-02 · `claude/dimensions-rate-cards-ilzcen` · on `8e0ffbeb`

One feature, many prices. `sms` stays a single metered feature; the
event's properties (`country`, `status`, `segment`) pick which rate on the
credit system's rate card it converts at.

---

## The hole

Today a rate card row is keyed by feature id alone
(`creditConfig.ts`, `CreditSchemaItemSchema`):

```
credit_schema: [
  { metered_feature_id: "sms", credit_amount: 1 }
]
```

`getCreditSchemaItem` (`creditSystemUtils.ts:195`) does
`schema.find(item => item.metered_feature_id === featureId)`. One row per
feature, one price per feature. So charging 1 credit for a US SMS and 4 for
a UK SMS means minting `sms_us` / `sms_uk` / `sms_de`… as separate features:
separate `/track` calls, separate balances, separate entitlements on every
product, and a combinatorial blowup the moment a second property
(delivery status, message segment) also moves the price.

The tracking side already carries what we need. `/track` and `/check`
both take `properties`
(`trackParams.ts:30`, `checkParams.ts:23`), and it already reaches the
deduction as `DeductionOptions.eventProperties`
(`deductionTypes.ts:15`), where usage-limit filters read it
(`prepareFeatureDeductionV2.ts:114`). Pricing just never looks at it.

---

## The model

A **dimension** is a conditional rate on an existing rate-card row. The row
keeps its current shape as the default; `dimensions` is an ordered override
list, first match wins.

```ts
// shared/models/featureModels/featureConfig/creditConfig.ts

const CreditDimensionMatchSchema = z.record(
  z.string().min(1).max(64),
  z.union([z.string().min(1).max(128), z.number(), z.boolean()])
    .transform(String)
    .pipe(z.string()),
);

// Rate half of a row, minus the feature key: flat or graduated.
const CreditRateSchema = z.union([
  z.object({ credit_amount: z.number(), tier_behavior: z.never().optional(),
             tiers: z.never().optional() }),
  z.object({ credit_amount: z.never().optional(),
             tier_behavior: z.literal("graduated"),
             tiers: z.array(CreditTierSchema) }),
]);

export const CreditDimensionSchema = z.object({
  key: z.string(),              // stable id, see "Attribution" below
  match: CreditDimensionMatchSchema,
  feature_amount: z.number().optional(),  // inherits the row's when omitted
}).and(CreditRateSchema);
```

`CreditSchemaItemBaseSchema` gains `dimensions: z.array(CreditDimensionSchema).optional()`.

```
{ metered_feature_id: "sms",
  credit_amount: 1,                                   ← default
  dimensions: [
    { key: "uk_failed", match: { country: "UK", status: "failed" },
      credit_amount: 0 },
    { key: "uk",  match: { country: "UK" }, credit_amount: 4 },
    { key: "row", match: { country: "DE" },
      tier_behavior: "graduated",
      tiers: [{ to: 1000, credit_amount: 3 }, { to: "inf", credit_amount: 2 }] },
  ] }
```

Reuses the value canonicalization already proven on usage-limit filters
(`usageLimit.ts:26-36`): scalars only, stringified, so `29384` and `"29384"`
are one condition.

### Matching

`usageLimitFilterMatchesProperties` (`usageLimit.ts:108`) is exactly the
predicate — every key in `match` must equal the event's property (AND),
string-normalized, objects and nullish never match. Lift it out of
`billingControls/` into a neutral `propertiesMatch` util and call it from
both.

Resolution:

```
resolveRate(item, eventProperties)
  → first d in item.dimensions where propertiesMatch(d.match, props)
  → else the item's own credit_amount / tiers      ← the default, per decision
```

**First match wins, order is significant.** More specific rows go first;
`{ country: "UK", status: "failed" }` above `{ country: "UK" }`. The
alternative (most-keys-wins) hides ties and makes the config unreadable —
an ordered list is what the UI will render anyway.

**No match falls through to the row's base rate.** Backwards compatible by
construction: a row with no `dimensions` resolves exactly as it does today,
and no property typo can silently price at zero. A dimension with
`match: {}` is rejected at validation (use the base rate instead) — an empty
match is a first-position catch-all that shadows everything below it.

---

## Where it plugs in

`eventProperties` has to reach the four schema-reading entry points in
`creditSystemUtils.ts`. All four already take `{ featureId, creditSystem }`;
each gains an optional `eventProperties`, threaded down to
`getCreditSchemaItem` → `resolveRate`.

```
/track  runRedisTrackV3.ts:128  eventProperties: body.properties
          → prepareDeductionOptionsV2 → prepareFeatureDeductionV2:140
              computeCreditCosts({ cusEnts, deduction, eventProperties })   ← add
                getCreditRateCard    creditSystemUtils.ts:208               ← +props
                getCreditCost        creditSystemUtils.ts:474               ← +props
          → CustomerEntitlementDeduction.rate_card                          resolved
              → Lua                                                         unchanged

/check  getCheckResponseV2.ts:38   already has `properties` in scope
          getCreditRateRequiredBalance  creditSystemUtils.ts:359            ← +props
        runCheckWithTrackV2.ts:105  same, from body.properties
```

The key property of this design: **dimension resolution happens before the
rate card is handed to Lua.** `CreditRateCard`
(`creditSystemUtils.ts:17`) is already the *resolved* rate — a
`feature_amount` plus either `credit_amount` or `tiers`. A resolved
dimension produces exactly that shape, so
`_luaScriptsV2/fullSubjectDeduction/**` needs no change, and neither does
`PreparedFeatureDeduction`.

Same reason locks are already correct: `unwindLockV2.lua:44` unwinds against
the rate card stored on the attribution delta, and the lock receipt persists
the event `properties` (`prepareFeatureDeductionV2.ts:250`,
`buildFinalizeLockContextV2.ts:65`). A held lock unwinds at the rate it was
priced at, not at whatever the config says later.

The legacy path (`deduction/prepareFeatureDeduction.ts:95`) takes the same
one-line change; both call the same `computeCreditCosts`.

---

## Attribution: the one hard part

`usage_attribution` is `Record<string, { units, credits }>` keyed by
**source internal feature id** (`cusEntModels.ts:30`). Two things read it,
and dimensions break both:

**1. Graduated tiers.** `get_credit_rate_current_units`
(`contextUtilsV2.lua:20`) reads `attribution[rate_card.source_internal_feature_id]`
as the tier cursor. With per-dimension tiers, UK usage would walk the tier
ladder using US usage as its running total — wrong, and silently so.

**2. Invoice credit lines.** `invoiceCreditCustomerEntitlementToLineItems.ts:62`
iterates attribution entries into one line per source feature. The whole
point of dimensions is that the customer sees `SMS · UK, 400 units` and
`SMS · US, 9,000 units` as separate lines at separate rates. One entry per
feature collapses them into an average price and a meaningless unit count.

So: **extend the attribution key, don't add a parallel structure.**

```
key = dimension ? `${source_internal_feature_id}:${dimension.key}`
                : source_internal_feature_id
```

`CreditRateCard` gains `attribution_key: string` (set by
`getCreditRateCard`), and the Lua reads `rate_card.attribution_key` with
`source_internal_feature_id` as the fallback for cards written before this
ships. Rows without dimensions keep their bare-feature-id key, so every
existing balance, invoice draft and in-flight lock keeps working untouched.

This is why dimensions carry an explicit `key` rather than deriving one from
`match`. Editing a dimension's match conditions (adding `status: "delivered"`
to the UK rule) must not orphan the live counter mid-cycle — the same reason
`usageLimitFilterKey` (`usageLimit.ts:92`) exists. `key` is generated on
create, immutable after, unique within the row.

Invoice line descriptions then need a dimension label: split the key, look
the dimension up on the current schema, and render
`${feature.name} · ${dimension.label ?? dimension.key}`. Add an optional
`label` to `CreditDimensionSchema` for exactly this — it is customer-facing
invoice copy. A key whose dimension has since been deleted falls back to the
feature name alone, matching the existing `"Removed feature"` handling.

---

## API surface

`shared/api/features/creditRateCard.ts` mirrors the db shape with the
external names (`credit_cost` for `credit_amount`, `billing_units` for
`feature_amount`):

```ts
export const ApiCreditDimensionSchema = z.object({
  key: z.string().nonempty(),
  label: z.string().optional(),
  match: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  billing_units: z.number().positive().optional(),
}).and(z.union([
  z.object({ credit_cost: z.number().min(0) }),
  z.object({ tier_behavior: z.literal("graduated"),
             tiers: z.array(ApiCreditTierSchema).min(1) }),
]));
```

Both `ApiCreditSchemaItemBaseSchema` and the response variant gain
`dimensions?: ApiCreditDimensionSchema[]`. Round-tripping goes in
`apiCreditSchemaItemToDb` / `dbCreditSchemaItemToApi`
(`apiFeatureToDbFeature.ts:80`), and the tier boundary `superRefine` gets
extracted so each dimension's tiers are validated by the same code as the
row's.

Versioning: `apiCreditSchemaToV0` (`V1.2_FeatureChange.ts:16`) already
returns `null` for any row it cannot express in the flat legacy shape
(graduated, non-unit billing units). Add `dimensions?.length` to that
bail-out condition — old clients see `credit_schema: null` rather than a
lie about the price.

### Validation

Server-side, next to the existing rate-card guards, and mirrored in
`vite/.../validateCreditSystem.ts` for inline form errors:

- `match` has 1..4 keys, non-empty (empty ⇒ "use the base rate instead")
- `key` unique within the row, `idRegex`-shaped
- each dimension is flat XOR graduated; tier boundaries strictly
  increasing, last is `inf` — the row's existing rules, reused
- `credit_cost >= 0`, `billing_units > 0`
- a dimension whose `match` is a superset-duplicate of an earlier one is a
  warning, not an error (order makes it intentional)
- **cap dimensions per row** (start at 20). The resolver is linear per
  track and runs inside the hot deduction path.

### Cache invalidation

`hasCreditRateCardChanged` (`hasCreditRateCardChanged.ts`) gates the
cached-cusEnt clear on feature update. `creditSchemaItemsEqual` compares
`feature_amount`, `tier_behavior`, `credit_amount`, `tiers` — it must also
compare `dimensions` by key, match, and rate, or a dimension-only edit ships
a stale rate card to every cached subject. `computeCreditCosts`'s
stale-schema guard (`computeCreditCosts.ts:118`) should extend the same way:
a cached row missing a dimension the current catalog defines is stale, not a
fall-back-to-1 case.

### Analytics

`resolveCreditCost` (`aggregateDeductions.ts:129`) returns a single
credits-per-unit for a source feature and already returns `null` for
graduated rows because "a single number would be a lie." A row with
dimensions is the same lie — return `null` there too, until the analytics
group-by can split on dimension key (which the extended attribution key now
makes possible).

---

## UI (phase 2)

`CreditRateCardRow.tsx` grows a collapsible "Dimensions" section under the
flat/tiered control: a list of rows, each a property/value key-value editor
plus the same rate control the parent row uses, drag-to-reorder, with the
base rate pinned at the bottom labelled "All other events". The
`useCreditSchema` hook (`credit-systems/hooks/`) generates `key` on add.
Gate behind `isAdmin` initially, as `showRateCardControls` already does.

---

## Phasing

1. **Model + resolver.** `creditConfig.ts` schema, `propertiesMatch` lifted
   out of `usageLimit.ts`, `resolveRate`, unit tests on resolution order and
   fallback. No behavior change — nothing writes `dimensions` yet.
2. **Pricing.** Thread `eventProperties` through the four
   `creditSystemUtils` entry points + `computeCreditCosts` + both prepare
   paths + both check paths.
3. **Attribution.** `attribution_key` on `CreditRateCard`, Lua reads it with
   the legacy fallback, invoice line labels. Integration test: two
   dimensions on one feature bill as two lines, and graduated tiers walk
   independent ladders.
4. **API.** Request/response schemas, db↔api mapping, validation, V0
   bail-out.
5. **UI.**

1–4 are shippable without 5 (config via API), which is what the scoping
decision on this task assumed.

---

## Not doing

- **Dimensions on AI credit systems.** Those price off model markups, not a
  schema; `getCreditCost` explicitly throws for them
  (`creditSystemUtils.ts:494`). Out of scope.
- **Dimensions on the feature itself** (i.e. on `metered` features outside a
  credit system). The rate card is the pricing surface; a bare metered
  feature has no price to vary. Property-scoped *limits* already exist via
  usage-limit filters.
- **Operators beyond equality.** No `in`, `gt`, prefix, or regex. The
  metered-feature `Expression` type (`meteredConfig.ts:4`) has an
  `operator` field if we ever want it, but equality covers
  country/status/tier and keeps the Lua-side key canonical.
- **Per-dimension balances.** Dimensions change the *price*, never which
  pool is drained. One `sms` feature, one credit balance.
- **Versioning credit systems.** Editing a dimension mid-cycle applies going
  forward, same as editing any rate today (`aggregateDeductions.ts:127`).

---

## Open questions

1. **Tier cursor scope.** Extended attribution keys give each dimension its
   own graduated ladder. Is that right? "First 1,000 SMS at 3 credits" more
   often means the first 1,000 *total*, not the first 1,000 per country. May
   want `tier_scope: "dimension" | "row"` on the row, defaulting to `row`
   (shared cursor, keyed by bare feature id) with per-dimension opt-in.
2. **Unmatched-event visibility.** Falling through to the base rate is safe
   but silent; a typo'd property prices at the default forever. Worth a
   counter or a dashboard "N% of sms events matched no dimension" panel.
3. **`/check` without properties.** A check that omits `properties` when
   dimensions exist gets the base rate for `required_balance`, which may
   understate the real cost. Document it, or surface the resolved rate on
   the check response.
