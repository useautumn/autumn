# catalogV2 plan cases — test matrix

Every create / update / batch / error case for `catalogV2.update` +
`preview_update` with `params.plans`, mapped to the test file that owns it.

Status legend:

- `✓` — test written and expected green against current implementation
- `red` — test written (or to write) as spec; server behavior not implemented
  yet (see-red-see-green TDD)
- blank — not written yet

Implementation order = file order below. One file at a time: write, typecheck,
run, fix, then move on.

Existing V1 suites to mirror coverage from (do NOT duplicate their transport,
only their scenarios): `server/tests/integration/crud/plans/**` (create shapes,
update lanes, in-place claims), `server/tests/integration/billing/misc/reuse-stripe-prices-*.test.ts`,
`server/tests/integration/crud/plans/update/update-plan-paid-item-stripe-carryforward.test.ts`.

Folder layout:

```
plans/
  CASES.md
  utils/expectCatalogPlans.ts
  create/
    create-plans.test.ts
    create-plan-items-free.test.ts
    create-plan-items-priced.test.ts
    utils/createAndAssert.ts
  update/
    idempotent-plans.test.ts
    update-plan-details.test.ts
    update-plan-items.test.ts
    update-plan-rows.test.ts
    update-plan-free-trial.test.ts
    stripe-reuse.test.ts
    stripe-reuse-mint.test.ts
  versions/
    plan-versions.test.ts
    new-version-mint.test.ts
    new-version-free-trial.test.ts
    all-versions-items.test.ts
    mixed-versioning-strategies.test.ts
    default-version-attach.test.ts
  migrations/
    utils/seedVersionableCustomer.ts
    utils/expectMigrationDrafts.ts
    existing-drafts.test.ts
    versioning-drafts.test.ts
    draft-guards.test.ts
  validation/
    default-flag.test.ts
    free-trial-validation.test.ts
    plan-errors.test.ts
  batch/
    batch-ops.test.ts
    features-plans-resolution.test.ts
    features-plans-type-and-removal.test.ts
  preview/
    utils/expectPlanPreview.ts
    preview-actions.test.ts
    preview-state-versioning.test.ts
    preview-migrations.test.ts
    changes/
      changes-details.test.ts
      changes-base-price.test.ts
      changes-items.test.ts
      changes-free-trial.test.ts
      changes-mixed.test.ts
```

## 1. Create basics — `create/create-plans.test.ts` (exists)

| Case | Status |
|---|---|
| Preview reports `create` and writes nothing | ✓ |
| Minimal `plan_id` + `name` → v1, empty items, defaults (`add_on`/`is_default` false) | ✓ |
| Boolean item + metered included + `$20/mo` base price | ✓ |
| Trial + `add_on` + `auto_enable` (+ `is_default`) + metadata + config + billing_controls | ✓ |

## 2. Create item shapes — `create/create-plan-items-free.test.ts` + `create/create-plan-items-priced.test.ts`

One case per `CreatePlanItemParamsV1` field/knob; assert round-trip through
`catalogV2.get` (extend `ExpectedPlan` with a full `items` matcher). Split by
free vs priced so the billing-model matrix stays navigable.

### Free — `create/create-plan-items-free.test.ts`

| Case | Status |
|---|---|
| Boolean feature (bare `feature_id`) | ✓ |
| Metered `included` + `reset.interval` month / year / `interval_count: 3` | ✓ |
| Non-resetting consumable (omit `reset`) | ✓ |
| `unlimited: true` | ✓ |
| `pooled: true` (unpriced boolean + unlimited metered — the accepted shapes) | ✓ |
| `rollover` max / `max_percentage` / expiry duration | ✓ |
| `entity_feature_id` (allocated / per-entity item) | ✓ |

### Priced (billing-model matrix) — `create/create-plan-items-priced.test.ts`

| Case | Status |
|---|---|
| Consumable usage-based — reset + priced (matched intervals) | ✓ |
| Consumable usage-based — graduated tiers | ✓ |
| Consumable prepaid — flat + `billing_units` + `max_purchase` | ✓ |
| Prepaid with `price.interval` differing from `reset.interval` | ✓ |
| Volume tiers + `flat_amount` (prepaid) | ✓ |
| Allocated prepaid — `proration` on_increase / on_decrease (Users) | ✓ |
| Allocated usage-based (arrear / v2) — `allocated_billing_behavior: arrear`, `should_prorate: false` | ✓ |
| `price.stripe_price_id` threaded to price config (internal param) | ✓ |
| `additional_currencies` on flat amount + on tiers | ✓ |
| Base `price` with `interval_count: 3` and `additional_currencies` | ✓ |

## 3. Idempotent — `update/idempotent-plans.test.ts`

| Case | Status |
|---|---|
| Re-send identical simple plan → action `none`, no write | ✓ |
| Re-send identical shaped plan (items + base price + metadata/config) → `none`; ent/price row ids unchanged (DB) | ✓ |
| Preview of identical re-send reports `none` | ✓ |

## 4. Detail facets — `update/update-plan-details.test.ts`

| Case | Status |
|---|---|
| name / description / group diffs reported in `previous_attributes`; persisted | ✓ (persisted; preview `changes.previous_attributes` not wired yet) |
| Details-only update leaves items/prices untouched (row ids stable, DB) | ✓ |
| metadata update (shared across versions) / config `ignore_past_due` toggle | ✓ |
| billing_controls patch persists / identical → `none` | ✓ |
| billing_controls single-key patch merges; other columns untouched | ✓ |
| billing_controls clear a lane via `[]`; re-send cleared lane → `none` | ✓ |
| billing_controls two plans in one call → no cross-contamination | ✓ |
| free_trial facets → moved to section 14 (`update/update-plan-free-trial.test.ts`) with exact-shape asserts | moved |
| archive / unarchive; omitted `archived` preserves | ✓ |
| `new_plan_id` clean rename (no customers): id changes, versions & rows intact | ✓ |
| auto_enable true on free plan → `is_default` persisted; auto_enable false clears | ✓ |

## 5. Item/price update lanes — `update/update-plan-items.test.ts`

Omit-semantics + per-facet shape changes, no customers. Assert via
`catalogV2.get` shape.

| Case | Status |
|---|---|
| Both `price`/`items` omitted → both unchanged | ✓ |
| `items` only → base price carried | ✓ |
| `price` only → items carried | ✓ |
| `price: null` → base removed, items carried | ✓ |
| Both set → both replaced | ✓ |
| Add feature item | ✓ |
| Remove feature item (`items` without it) | ✓ |
| Change `included` (allowance bump) | ✓ |
| Free → paid on same feature (add `price` to item) | ✓ |
| Paid → free (drop item price) | ✓ |
| Change price amount / tiers / tier_behavior / billing_units | ✓ |
| Change reset interval (month → year) | ✓ |
| Toggle unlimited / pooled / rollover / proration on existing item | ✓ |

## 6. Claim / row carry-over — `update/update-plan-rows.test.ts`

DB-level asserts on entitlement/price rows (`ProductService.getFull`),
mirroring `crud/plans/update/in-place/*`. Claim rule: definition-exact match →
`same` (row id stable); any change mints `new` row; old row `deleted` (no
customers) or `retired` + `is_custom: true` (customers exist, never hard-deleted).

Customer refs are DB-seeded (Stripe Connect harness currently broken for
`s.customer` / attach).

| Case | Status |
|---|---|
| Base price only change: feature ent/price row ids stable; old base price row gone (no customers) | ✓ |
| Remove one item: remaining rows stable; removed rows deleted (no customers) | ✓ |
| Included bump: new ent row id; old ent deleted (no customers) | ✓ |
| With attached customer — included bump: old ent retained + `is_custom: true`; customer's cus_ent still references old ent id | ✓ |
| With attached customer — remove item: old rows retained/retired; customer keeps grant | ✓ |
| With attached customer — base price change: old base price retired; customer billing rows untouched | ✓ |
| Expired-only customers → treated as no-customers (rows deleted, not retired) | ✓ |
| **Bad state — customer's cus_product on v2 but cus_ent references v1's ent: pinned v1 update retires (never deletes) v1 rows; cus_ent survives** | ✓ |
| **Bad state — same shape with cus_price → v1 base price: pinned v1 price change retires old base; update succeeds** | ✓ |

## 7. Stripe ID re-use — `update/stripe-reuse.test.ts`

Init real Stripe resources via `initStripeResourcesForProducts` (same path
`updateProduct` uses — see `initPlanStripeResources`), then update via
catalogV2 and assert reuse levels with
`expectPriceStripeReuseCorrect` / `expectPriceStripeResourcesAbsent`
(`server/tests/integration/utils/expectStripePriceResources.ts`). Levels
match `PriceStripeReuseLevel`: `full` / `stripeProductOnly` / `none`.

| Case | Status |
|---|---|
| Unchanged paid item across update → `full` reuse | ✓ |
| Details-only update → `full` reuse on paid + base | ✓ |
| Usage amount change → `stripeProductOnly` (product + meter; not price id) | ✓ |
| Prepaid amount change → `stripeProductOnly` | ✓ |
| Graduated → volume switch → `stripeProductOnly` | ✓ |
| Base price change → `none` (fixed ≠ usage); new row has null ids | ✓ |
| Add new paid item → no stripe ids (minted lazily later) | ✓ |
| `new_version` mint carries full stripe ids on matching item | ✓ (`update/stripe-reuse.test.ts`; expanded in `update/stripe-reuse-mint.test.ts` / §15) |

## 8. Versions — `versions/plan-versions.test.ts`

| Case | Status |
|---|---|
| Pinned `version: 1` edit; latest (v2) untouched | ✓ |
| Omit version targets latest | ✓ |
| Multi-entry same plan_id (v1 + v2 different payloads) in one call | ✓ |
| Mint ladder: existing v1; entries v1 (update) + v2 (create) → v2 row created | ✓ |
| `versioning: "new_version"` mints max+1 clone; customers stay on old version | ✓ (expanded in §15) |
| `all_versions` (omit version): change propagates to every existing version | ✓ |
| `all_versions` on brand-new plan → plain create, no error | ✓ |
| `all_versions` propagates `free_trial` to every version (section 14 cross-ref) | ✓ (passed via per-row free-trial facet; no versioning work needed) |
| Pinned `version: 1` trial edit; latest untouched (section 14 cross-ref) | ✓ (passed via per-row free-trial facet; no versioning work needed) |

## 9. Default flag — `validation/default-flag.test.ts`

Spec: only free plans and default-trial plans (`card_required: false`) can be
`auto_enable`. Evaluated against projected upsert state (no silent flips).

| Case | Status |
|---|---|
| Free plan `auto_enable: true` → OK | ✓ |
| Paid plan + cardless trial (`card_required: false`) `auto_enable: true` → OK | ✓ |
| Paid recurring plan, no trial, `auto_enable: true` → error | ✓ |
| One-off priced plan `auto_enable: true` → error | ✓ |
| `auto_enable: true` on pinned historical version → error (`HistoricalPlanVersionCannotBeDefault`) | ✓ |
| Defaults in different groups coexist → OK | ✓ |

Open question (do not test yet): multiple free defaults in the SAME group —
v1 `validateDefaultFlag` rejects; user leaning toward allowing. Decide before
wiring validation into catalogV2.

## 10. Errors — `validation/plan-errors.test.ts`

`versioning: "new_version"` is a valid mint strategy (see §15), not an
unconditional 400. The rows below are combination / missing-plan guards only.
Preview `options` include `new_version` when the latest version has customers
(see §13 C).

| Case | Status |
|---|---|
| `versioning: "new_version"` + explicit `version` → 400 | ✓ |
| `versioning: "new_version"` + `migration.draft` → 400 | ✓ |
| `versioning: "new_version"` on missing plan → 400 | ✓ |
| `versioning: "all_versions"` + explicit `version` → 400 | ✓ |
| Duplicate `(plan_id, version)` entries → error | ✓ |
| Two unpinned entries for same plan_id → error | ✓ |
| Version gap (declare v3 when max is v1) → error | ✓ |
| Create without `name` → error | ✓ |
| `new_plan_id` rename blocked when plan has customers | ✓ |
| `new_plan_id` rename blocked when reward program references plan | ✓ |
| Invalid item shape passes through Zod errors (amount+tiers both set; volume flat_amount on graduated; `tiers[0].to <= included`; proration on usage_based; reset/price interval mismatch on non-prepaid) | ✓ |

## 11. Plan × plan batch — `batch/batch-ops.test.ts`

| Case | Status |
|---|---|
| Create + update + archive (3 plans) in one call; preview reports all three, writes nothing | ✓ |
| Create two plans with the same `plan_id` → error | ✓ |
| Rename A→B while plan B already exists → error | ✓ |
| Rename A→B while B is also being created in the same call → error | ✓ |
| Create + update of the same plan_id in one call (create entry + pinned v1 entry) → error | ✓ |
| Rename A→B and separately update A in same call → error (stale reference) | ✓ (caught as duplicate unpinned plan_id) |

## 12. Feature × plan interplay — `batch/features-plans-resolution.test.ts` + `batch/features-plans-type-and-removal.test.ts`

Plan compute resolves items against the projected feature set (post
update/insert/remove), so same-call creates and renames are visible and stale
ids are a 404 `feature_not_found`.

### Resolution (creates/renames) — `batch/features-plans-resolution.test.ts`

| Case | Status |
|---|---|
| Create feature + create plan with item referencing it → entitlement linked to the batch-created feature row | ✓ |
| Create metered feature + credit system + plan granting the CS, one call | ✓ |
| Rename feature F→G + plan item referencing G (new id) → resolves | ✓ |
| Rename feature F→G + plan item referencing F (old id) → 404 `feature_not_found` | ✓ |
| Plan referencing pre-existing feature alongside unrelated feature ops → green path | ✓ |

### Type changes + removals — `batch/features-plans-type-and-removal.test.ts`

| Case | Status |
|---|---|
| Change feature type (boolean→metered) + plan item using metered config, one call | ✓ |
| Change feature type (metered→boolean) + plan item with metered config (`100 X/mo`) → coerced to boolean item (`included: 0`, `reset: null`) | ✓ |
| Remove feature + create/update plan that references it → 404 `feature_not_found` | ✓ |
| Remove + recreate same feature id + plan referencing it → `invalid_feature` same-call conflict | ✓ |
| Remove feature + update plan dropping its item in same call → OK | ✓ |

## 13. Preview completeness — `preview/`

Orchestrator: `preview/buildUpdateCatalogPreview` → `plans/` + `features/`.
Plan rows carry `action`, `state`, `versioning`, `plan_change` (nullish on
create / none). Every test parses with `PreviewUpdateCatalogResponseSchema`
and asserts preview writes nothing.

**Versioning options** (pickable-only — no `available`/`reason`):

- `existing` when the pinned version has customers
- `all_versions` when the plan has >1 version
- `new_version` when has customers **and** targeting latest (matches
  `PlanChangeDialog` — past versions never get it)

**`plan_change` shape:** `previous_attributes` | `price_change?` |
`free_trial_change?` | `item_changes[]` | `customize?`. Create → nullish.

Diff semantics (from `diffPlanV1` — the contract for `customize`):

- Item identity (match key) = `feature_id | billing_method | interval |
  interval_count`. In-place modification = `remove_items` filter + `add_items`
  entry ("out with the old, in with the new").
- Defaults normalize away: `included: 0`, `interval_count: 1`, `billing_units:
  1`, `pooled: false`, `tier_behavior: graduated` (with tiers), trial
  `card_required: true` / `on_end: "bill"` / `duration_type: month` — explicit
  default ≡ omitted, so they must NOT produce a diff.
- Additional currencies: adding/removing a currency is NOT a diff; only a
  changed amount for a currency present on both sides is.
- `customize` lanes: `price`, `add_items`, `remove_items`, `free_trial`.
- `billing_controls` in `previous_attributes` must be **sparse** (only the
  control keys that changed — e.g. `auto_topups` only if that's what flipped).

Known schema gap (flag, don't test): preview rows have no top-level `version`;
multi-version entries are only distinguishable via `versioning.current_version`.
Skip `description` in detail coverage (not a product surface we care about).

### A. Actions — `preview/preview-actions.test.ts`

| Case | Status |
|---|---|
| New plan_id → `create` | ✓ |
| Existing plan, detail-only diff → `update` | ✓ |
| Existing plan, items-only diff → `update` | ✓ |
| Existing plan, base-price-only diff → `update` | ✓ |
| Identical re-send → `none` | ✓ |
| Re-send with explicit defaults (`included: 0` on boolean, `interval_count: 1`, `pooled: false`) → `none` (normalization, no false positives) | ✓ |
| Omitting `items`/`price` lanes entirely, same details → `none` | ✓ |
| `archived` toggle → `update` | ✓ |
| Multi-plan call → per-entry actions independent (create + update + none in one preview) | ✓ |
| Pinned `version: 1` entry → action computed against v1 row, not latest | ✓ |
| `update` response `results.plans` actions match the preview's actions for identical params (parity) | ✓ |

### B1. Detail changes — `preview/changes/changes-details.test.ts`

Each case: `previous_attributes` holds the old value for exactly the changed
keys; `customize` null; `item_changes` empty; no `price_change`.

| Case | Status |
|---|---|
| `name` change → `previous_attributes.name` = old name, nothing else | ✓ |
| `group` / `add_on` each individually (skip description) | ✓ |
| `auto_enable` flip → previous `auto_enable` | ✓ |
| `archived` flip → previous value | ✓ |
| `metadata` change → previous metadata object | ✓ |
| `billing_controls` whole-object change → previous nested `billing_controls` | ✓ |
| **`billing_controls` sparse: only `auto_topups` flips, `usage_alerts` unchanged → previous holds only `auto_topups`** | ✓ |
| **`new_plan_id` A→B → `previous_attributes.id` = A** | ✓ |
| `config.ignore_past_due` flip → previous config | ✓ |
| Multi-detail change → all changed keys present, unchanged keys absent | ✓ |
| Field explicitly set to its current value → NOT in `previous_attributes` | ✓ |

### B2. Base price changes — `preview/changes/changes-base-price.test.ts`

Each case asserts BOTH `price_change { previous, current }` and the
`customize.price` lane.

| Case | Status |
|---|---|
| Add base price (none → `$20/mo`) → `previous: null`, `current` populated; `customize.price` = full params | ✓ |
| Amount change (`20 → 30`) | ✓ |
| Interval change (month → year) | ✓ |
| `interval_count` change (1 → 3); explicit `interval_count: 1` → no diff | ✓ |
| Remove (`price: null`) → `current: null`; `customize.price: null` | ✓ |
| Additional currency amount change (currency on both sides) → diff | ✓ |
| Additional currency added/removed only → NO price diff (compatible rule) | ✓ |
| Items-only update → no `price_change`, `customize.price` absent | ✓ |

### B3. Item changes — `preview/changes/changes-items.test.ts`

Each case asserts BOTH `item_changes` (created/deleted snapshots) and the
`customize.add_items`/`remove_items` lanes, including the remove-filter shape
(`feature_id` + `billing_method`/`interval`/`interval_count` when priced).

| Case | Status |
|---|---|
| Add free item → `created` entry; `add_items` full params; no `remove_items` | ✓ |
| Add priced item → `created`; `add_items` includes price block | ✓ |
| Remove item → `deleted`; `remove_items` filter only | ✓ |
| Included bump (same match key) → `deleted`+`created` pair; `remove_items` filter + `add_items` new shape | ✓ |
| Price amount change on priced item (same key) → remove+add pair | ✓ |
| Reset/billing interval change (match key CHANGES) → `remove_items` filter carries the OLD interval, `add_items` the new | ✓ |
| `billing_method` change prepaid → usage_based (key change) → remove(old method)+add(new) | ✓ |
| Free → paid on same feature → remove(free key)+add(paid key) | ✓ |
| Paid → free | ✓ |
| `unlimited` toggle → remove+add (same key) | ✓ |
| `pooled` toggle → remove+add | ✓ |
| Rollover add / change / remove → remove+add | ✓ |
| Proration change on prepaid → remove+add | ✓ |
| `billing_units` / `max_purchase` change → remove+add | ✓ |
| Tier edit (amount, `to` boundary, `flat_amount`) → remove+add | ✓ |
| `tier_behavior` graduated → volume → remove+add; explicit `graduated` with tiers → no diff | ✓ |
| Item additional-currency amount change → diff; currency add/remove only → no diff | ✓ |
| Two items same feature, different intervals → only the edited keyed pair diffs, sibling untouched | ✓ |
| **Split: `100 X/mo` → `50 X/mo` + `50 X/one_off` → 1 deleted (mo@100) + 2 created (mo@50, one_off@50)** | ✓ |
| Re-send with explicit defaults on items → `item_changes` empty, no customize lanes | ✓ |

### B4. Free trial lane — `preview/changes/changes-free-trial.test.ts`

| Case | Status |
|---|---|
| Add trial → `customize.free_trial` = params | ✓ |
| `duration_length` / `duration_type` change → diff | ✓ |
| `card_required` flip → diff; explicit `card_required: true` ≡ omitted → no diff | ✓ |
| `on_end` change → diff; explicit `"bill"` ≡ omitted → no diff | ✓ |
| Remove trial (`free_trial: null`) → `customize.free_trial: null` | ✓ |

### B5. Mixed changes — `preview/changes/changes-mixed.test.ts`

| Case | Status |
|---|---|
| Details + base price + items + trial in one entry → all lanes coherent | ✓ |
| Create with full shape → `plan_change` nullish (`null` or `undefined`); `action: "create"` | ✓ |
| Items + price change, details untouched → `previous_attributes` null/empty | ✓ |
| Multi-plan call → each row's `plan_change` scoped to its own plan | ✓ |

### C. State + versioning — `preview/preview-state-versioning.test.ts`

Pickable-only `options` (no `available`/`reason`). `new_version` requires
customers **and** latest.

| Case | Status |
|---|---|
| Plan with attached customer → `has_customers: true`; without → `false` | ✓ |
| Expired-only customers → `has_customers: false` | ✓ |
| Latest of 2-version, no customers → `options: [all_versions]`, `resolved: existing` | ✓ |
| Latest + customers + multi-version → `options: [existing, new_version, all_versions]` | ✓ |
| **Pinned `version: 1` (not latest) + customers → `options` has `existing`+`all_versions`, never `new_version`** | ✓ |
| `versioning: "new_version"` preview → `create` row, `resolved: new_version`, `plan_change` from base | ✓ |
| `all_versions` → one preview row per version; each `resolved: all_versions` | ✓ |

## 14. Free trials — `update/update-plan-free-trial.test.ts` + `validation/free-trial-validation.test.ts`

Spec for the free-trial slice now being implemented server-side (claim-style
`computeFreeTrialPlan` taking `FreeTrialParamsV1`, with a `freeTrialsAreSame`
comparator). Intended semantics, which differ from v1 `handleNewFreeTrial`:

- Unchanged trial → RE-USE the existing free_trial row (same row id).
- Changed or removed trial → ALWAYS retire the old row (`is_custom: true`,
  never hard-delete, no customer-reference detection) and mint a new row on
  change. v1 mutated the row in place — that behavior is gone.
- Comparator must include `on_end` (v1's `freeTrialsAreSame` misses it) and
  normalize param defaults: `duration_type: month`, `card_required: true`,
  `on_end: bill` ≡ omitted. `unique_fingerprint` is row-side only (not in
  params) — never a diff source.
- Validation runs against PROJECTED state and rejects; no silent `is_default`
  flips (v1 unset default when `card_required` went false→true).

**Helper change (done):** `ExpectedPlan.hasFreeTrial` replaced with
`freeTrial?: { duration_length, duration_type, card_required, on_end } | null`
in `utils/expectCatalogPlans.ts` (exact object; `on_end` normalized `?? null`;
`null` = absent). Swept create-plans / default-flag; trial facets removed from
update-plan-details (section 4 → moved).

### Shape round-trip + update lanes — `update/update-plan-free-trial.test.ts`

| Case | Status |
|---|---|
| Create with full trial (`day`/7/`card_required: false`/`on_end: revert`) → exact shape via catalogV2.get | ✓ |
| Create with minimal trial (`duration_length` only) → defaults resolved: `duration_type: month`, `card_required: true` | ✓ |
| `duration_type` day / month / year round-trip; `on_end` bill / revert round-trip | ✓ |
| Add trial to existing plan without one | ✓ |
| Change each field individually (length, type, card_required, on_end) → exact new shape | ✓ |
| Remove (`free_trial: null`) → absent in response | ✓ |
| Omit `free_trial` key → preserved exactly (carry) | ✓ |
| Cross-facet patch: items+price change (trial omitted) → trial preserved; trial-only change → items/base price carried | ✓ |
| Identical re-send (incl. explicit defaults `card_required: true` / `on_end: bill` / `duration_type: month`) → action `none` | ✓ |
| Trial-only change → action `update` (today op stays `none`) | ✓ |

### Row semantics (DB asserts on free_trial rows)

| Case | Status |
|---|---|
| Unchanged trial across update → same free_trial row id | ✓ |
| Changed trial → NEW row id; old row retained with `is_custom: true` (no customers needed) | ✓ |
| Removed trial → old row retained, `is_custom: true`, never deleted | ✓ |
| `on_end`-only change → counts as change (new row) — comparator includes on_end | ✓ |
| Plan with attached customer on trial → same retire behavior; customer's cus_product keeps old trial row reference | ✓ |

### Validation (projected state) — `validation/free-trial-validation.test.ts`

| Case | Status |
|---|---|
| Trial on one-off plan (create, one entry) → 400 | ✓ |
| Add trial to existing one-off plan → 400 | ✓ |
| Same-call projection: update making plan one-off while keeping/adding trial → 400 | ✓ |
| Default plan (auto_enable) + trial with `card_required: true` → 400 (not silent flip) | ✓ |
| Update trial `card_required` false→true on a default plan → 400 | ✓ |
| Remove trial from default paid plan (no longer default-trial eligible) → 400 | ✓ |
| Free default plan without trial → OK (control) | ✓ |

### Related coverage elsewhere (cross-refs, keep in their files)

| Case | Where |
|---|---|
| `customize.free_trial` diff lane (add/change/remove/defaults) | `preview/changes/changes-free-trial.test.ts` (B4) |
| Cardless-trial default plan allowed | `validation/default-flag.test.ts` |
| `all_versions` trial propagation; version-pinned trial edit | `versions/plan-versions.test.ts` — both ✓ via per-row trial facet |
| `new_version` trial copy / null / change | `versions/new-version-free-trial.test.ts` — §15 |

### Comparator unit matrix (impl agent owns, listed for completeness)

`freeTrialsAreSame` unit cases: null×null → same; null×set → differ; each
field differing (length, type, card_required, on_end); defaults normalization
(month / card true / on_end bill ≡ omitted); `unique_fingerprint` ignored for
params-side comparison.

## 15. Versioning — new_version mint / all_versions / mixed

Mint clones the latest version (`id` stable, `version = max+1`, new
`internal_id`, `processor` copied), remints entitlements/prices/free-trial
rows, then applies param changes. Omitted facets are carried. Known gaps not
covered here: `initStripeResourcesForProducts` is not wired after execute
(carry only works from pre-seeded ids), reward migration is not queued,
license links are not copied.

### A1 — mint mechanics — `versions/new-version-mint.test.ts`

| Case | Status |
|---|---|
| Old version byte-untouched after details mint (stable ents/prices/base, no `is_custom` stamps, v1 name/items/price/trial unchanged) | ✓ |
| Mint + items change: changed item new row on v2; untouched items copied with new row ids; v1 untouched | ✓ |
| Omitted facets carried (name-only mint → v2 keeps items/base/trial/metadata/billing_controls); all v2 row ids reminted | ✓ |
| `is_default` moves: minted version is default, old version flag cleared (`auto_enable: true` on create) | ✓ |
| `new_version` with no customers → mint allowed (spec decision pending) | ✓ |
| `new_version` with identical params (zero diff) → still mints v2 (spec decision pending) | ✓ |

### A2 — trial on mint — `versions/new-version-free-trial.test.ts`

| Case | Status |
|---|---|
| `free_trial` omitted + base has trial → v2 trial copied with new row id, same shape; v1 trial row untouched | ✓ |
| `free_trial: null` on mint → v2 has no trial; v1 trial intact | ✓ |
| `free_trial: {...changed}` on mint → v2 new shape; v1 unchanged. Trial-only mint (no items/price) still copies items | ✓ |

### A3 — stripe carry on mint — `update/stripe-reuse-mint.test.ts`

| Case | Status |
|---|---|
| Untouched paid item → full reuse on v2 (`stripe_price_id` + `stripe_product_id`) | ✓ |
| Amount change on mint → product id carried, stripe price id not reused | ✓ |
| New paid item on mint → no stripe ids; plan-level `processor.id` carried onto the v2 products row | ✓ |

### C — all_versions items — `versions/all-versions-items.test.ts`

| Case | Status |
|---|---|
| `all_versions` items change propagates to every version (in-place; version count unchanged) | ✓ |
| No accidental mint: after all_versions update, max version is still 2 | ✓ |
| Customer attached on v1 only → all_versions still patches both versions in place | ✓ |

### D — mixed strategies — `versions/mixed-versioning-strategies.test.ts`

| Case | Status |
|---|---|
| One call: A `new_version` (v3 minted, v1+v2 untouched) + B `all_versions` (both patched, no mint) + C pinned `version: 1` (only v1 changed) + D create (v1) | ✓ |
| Preview parity for the same call: per-plan `versioning` block / action matches each strategy | ✓ |

### E — default version attach — `versions/default-version-attach.test.ts`

Attach picks one row per plan id via `ProductService.listDefault` →
`getLatestProducts` (max version among `is_default` rows), so even a dual-flag
bad state attaches only the latest.

| Case | Status |
|---|---|
| Default free v1 → mint v2 → customer created after mint attaches v2 only; pre-mint customer stays on v1 | ✓ |
| Bad state: v1 AND v2 both `is_default` (forced via DB) → new customer attaches exactly one cusProduct, on latest | ✓ |

## 16. Migration drafts — `migrations/*.test.ts` + `preview/preview-migrations.test.ts`

One draft covering every plan that sets `migration.draft: true` with `existing` / `all_versions`.
`new_version` + `draft: true` is a 400 (the mint is the opt-out). Filter is `$or` across
plans, version `$in` within a plan; collapse drops the version pin only when multiple
targeted versions cover every customer-bearing version. Ops bucket by customize + `include_custom`.

| Case | Status |
|---|---|
| `existing` + item diff + versionable customers → version-pinned draft, `custom: false` | ✓ `migrations/existing-drafts.test.ts` |
| Omitted `migration` / no customers / name-only → no draft | ✓ |
| `new_version` + `draft: true` → 400 | ✓ `validation/plan-errors.test.ts` |
| `all_versions` identical per-version diffs → one op, unversioned filter | ✓ |
| `all_versions` differing sibling diff → two version-pinned ops | ✓ |
| `all_versions`, customers only on v1 → version-pinned to v1, sibling excluded | ✓ |
| Mixed A `new_version` + B `existing` → one draft covering only B | ✓ |
| `include_custom` omitted → `custom: false` on filter AND every `update_plan.plan_filter` | ✓ `migrations/draft-guards.test.ts` |
| `include_custom: true` omits `custom` from filter AND every op | ✓ |
| Price change stamps `previous_price`, `no_billing_changes: false` | ✓ |
| Two plans, different `include_custom` → one draft, `$or` filter, per-op guards | ✓ |
| Preview `migrations` block matches compute; preview does not persist | ✓ `preview/preview-migrations.test.ts` |
| Update response `migrations: [{ id, plans: [{ plan_id, versions }] }]` | ✓ |
| Pinned historical v1 (v2 exists) stays version-pinned | ✓ `migrations/filter-collapse.test.ts` |
| `all_versions` covering every customer-bearing version collapses even if a customer-free v3 exists | ✓ |
| Mixed `all_versions` + pinned v1 + create → one draft, create skipped, independent filters | ✓ |
| Paused customer → draft; expired-only → no draft; create + draft → no draft | ✓ `migrations/eligibility-status.test.ts` |
| Add paid item → `add_items`, `no_billing_changes: false` | ✓ `migrations/customize-lanes.test.ts` |
| Remove paid item → `remove_items`, `no_billing_changes: false` | ✓ |
| `price: null` stamps `previous_price`; trial+items drops trial from customize | ✓ |
| Two plans, identical item diff → one op with `$or` plan_filter | ✓ `migrations/customize-buckets.test.ts` |
| Interval change → remove old match key + add new key | ✓ |
| Price + items in one update → one op with both lanes | ✓ |
| Feature rename + item bump → remove old feature_id, add new | ✓ `migrations/customize-buckets.test.ts` |
| One paid plan poisons `no_billing_changes` for the whole draft | ✓ `migrations/billing-flag.test.ts` |
| Additional-currency add only → no draft | ✓ |
| Free-item edit with paid sibling on same `feature_id` → billing change (lossy lookup) | ✓ |

## Deferred (later slice)

| Case |
|---|
| `all_versions` + direct per-version override ordering |
| Variants / licenses in catalog params |
| `create_in_stripe` behavior (currently unused) |
| In-place `updated` EP bucket (never populated today) |
