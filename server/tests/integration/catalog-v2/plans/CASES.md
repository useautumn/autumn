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
    create-plan-items.test.ts
  update/
    idempotent-plans.test.ts
    update-plan-details.test.ts
    update-plan-items.test.ts
    update-plan-rows.test.ts
    update-plan-free-trial.test.ts
    stripe-reuse.test.ts
  versions/
    plan-versions.test.ts
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

## 2. Create item shapes — `create/create-plan-items.test.ts`

One case per `CreatePlanItemParamsV1` field/knob; assert round-trip through
`catalogV2.get` (extend `ExpectedPlan` with a full `items` matcher).

| Case | Status |
|---|---|
| Boolean feature (bare `feature_id`) | ✓ |
| Metered `included` + `reset.interval` month / year / `interval_count: 3` | ✓ |
| Non-resetting consumable (omit `reset`) | ✓ |
| `unlimited: true` | ✓ |
| `pooled: true` (unpriced boolean + unlimited metered — the accepted shapes) | ✓ |
| Reset AND priced (usage_based, `reset.interval === price.interval`) | ✓ |
| Prepaid flat `amount` + `billing_units: 100` + `max_purchase` | ✓ |
| Prepaid with `price.interval` differing from `reset.interval` (allowed for prepaid only) | ✓ |
| Usage-based graduated tiers (multi-tier, `to` boundaries above `included`) | ✓ |
| Volume tiers + `flat_amount` (prepaid; `tier_behavior: volume_based`) | ✓ |
| `additional_currencies` on flat amount + on tiers (org must have multi-currency enabled — check scenario setup; skip if not supported by harness) | ✓ |
| `proration` `on_increase`/`on_decrease` on prepaid | ✓ |
| `rollover` max / `max_percentage` / expiry duration | ✓ |
| `entity_feature_id` (allocated / per-entity item) | ✓ |
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
| With attached customer — included bump: old ent retained + `is_custom: true`; customer's cus_ent still references old ent id | red (execute ignores `retired` — no `is_custom` stamp) |
| With attached customer — remove item: old rows retained/retired; customer keeps grant | red (execute ignores `retired`) |
| With attached customer — base price change: old base price retired; customer billing rows untouched | red (execute ignores `retired`) |
| Expired-only customers → treated as no-customers (rows deleted, not retired) | red (`hasAnyCustomerProducts` includes expired) |

## 7. Stripe ID re-use — `update/stripe-reuse.test.ts`

Seed stripe ids on rows (or attach once to create them), then update via
catalogV2 and assert `processor` ids on DB rows. Mirror
`update-plan-paid-item-stripe-carryforward` + `reuse-stripe-prices-versioning`
scenarios for the in-place path.

| Case | Status |
|---|---|
| Unchanged paid item across update → `stripe_price_id` + `stripe_product_id` carried | ✓ |
| Details-only update → all stripe ids carried | ✓ |
| Price amount change on item → `stripe_product_id` (+ meter) carried, `stripe_price_id` NOT reused | ✓ |
| Prepaid amount change → `stripe_price_id` not reused | ✓ |
| Graduated → volume switch → `stripe_price_id` not reused | ✓ |
| Base price change → new base row carries stripe product; old price id dropped | ✓ (reclassified: fixed amount change gets no stripe carry — usage-only product carry; new row has null ids) |
| Add new paid item → no stripe ids (minted lazily later) | ✓ |

## 8. Versions — `versions/plan-versions.test.ts`

| Case | Status |
|---|---|
| Pinned `version: 1` edit; latest (v2) untouched | ✓ |
| Omit version targets latest | ✓ |
| Multi-entry same plan_id (v1 + v2 different payloads) in one call | ✓ |
| Mint ladder: existing v1; entries v1 (update) + v2 (create) → v2 row created | ✓ |
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

| Case | Status |
|---|---|
| `versioning: "new_version"` → 400 `invalid_request` | ✓ |
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
| Rename A→B while plan B already exists → error | red (throws `internal_error` today — want `invalid_request`) |
| Rename A→B while B is also being created in the same call → error | red |
| Create + update of the same plan_id in one call (create entry + pinned v1 entry) → deterministic single outcome or error | red (needs spec decision — encode error) |
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
| Change feature type (metered→boolean) + plan item with metered config (`100 X/mo`) → coerced to bare boolean item (no included/reset) | red (item persists included/reset as-is; no coercion and no validateProductItems rule) |
| Remove feature + create/update plan that references it → 404 `feature_not_found` | ✓ |
| Remove + recreate same feature id + plan referencing it → `invalid_feature` same-call conflict | red (plan compute throws `feature_not_found` first, so the guard error depends on whether a plan references the feature) |
| Remove feature + update plan dropping its item in same call → OK | ✓ |

## 13. Preview completeness — `preview/`

`buildUpsertProductsPreview` currently stubs `versioning: null`, `changes:
null`, `will_archive: false` — so all `changes`/`versioning` cases are red
spec. Every test here also parses the response with
`PreviewUpdateCatalogResponseSchema` and asserts preview writes nothing.

Diff semantics under test (from `diffPlanV1` — the contract for `customize`):

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

Known schema gap (flag, don't test): preview rows have no top-level `version`;
multi-version entries are only distinguishable via `versioning.current_version`.

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

All red until `changes` is wired. Each case: `previous_attributes` holds the
old value for exactly the changed keys; `customize` null; `item_changes`
empty; no `price_change`.

| Case | Status |
|---|---|
| `name` change → `previous_attributes.name` = old name, nothing else | red (changes stubbed null) |
| `description` / `group` / `add_on` each individually | red (changes stubbed null) |
| `auto_enable` flip → previous `is_default` (or `auto_enable`) exposed | red (changes stubbed null) |
| `archived` flip → previous value exposed | red (changes stubbed null; also not in diffPlanV1PreviousAttributes keys today) |
| `metadata` change → previous metadata object | red (changes stubbed null; also not in diffPlanV1PreviousAttributes keys today) |
| `billing_controls` change → previous nested `billing_controls` | red (changes stubbed null) |
| `config.ignore_past_due` flip → previous config | red (changes stubbed null) |
| Multi-detail change → all changed keys present, unchanged keys absent | red (changes stubbed null) |
| Field explicitly set to its current value → NOT in `previous_attributes` | red (changes stubbed null) |

### B2. Base price changes — `preview/changes/changes-base-price.test.ts`

Each case asserts BOTH `price_change { previous, current }` and the
`customize.price` lane.

| Case | Status |
|---|---|
| Add base price (none → `$20/mo`) → `previous: null`, `current` populated; `customize.price` = full params | red (changes stubbed null) |
| Amount change (`20 → 30`) | red (changes stubbed null) |
| Interval change (month → year) | red (changes stubbed null) |
| `interval_count` change (1 → 3); explicit `interval_count: 1` → no diff | red (changes stubbed null; explicit-1 half expects action `none`) |
| Remove (`price: null`) → `current: null`; `customize.price: null` | red (changes stubbed null) |
| Additional currency amount change (currency on both sides) → diff | red (changes stubbed null) |
| Additional currency added/removed only → NO price diff (compatible rule) | red (changes stubbed null; compute currently reports action `update` — ambiguity vs diffPlanV1) |
| Items-only update → no `price_change`, `customize.price` absent | red (changes stubbed null) |

### B3. Item changes — `preview/changes/changes-items.test.ts`

Each case asserts BOTH `item_changes` (created/deleted snapshots) and the
`customize.add_items`/`remove_items` lanes, including the remove-filter shape
(`feature_id` + `billing_method`/`interval`/`interval_count` when priced).

| Case | Status |
|---|---|
| Add free item → `created` entry; `add_items` full params; no `remove_items` | red (changes stubbed null) |
| Add priced item → `created`; `add_items` includes price block | red (changes stubbed null) |
| Remove item → `deleted`; `remove_items` filter only | red (changes stubbed null) |
| Included bump (same match key) → `deleted`+`created` pair; `remove_items` filter + `add_items` new shape | red (changes stubbed null) |
| Price amount change on priced item (same key) → remove+add pair | red (changes stubbed null) |
| Reset/billing interval change (match key CHANGES) → `remove_items` filter carries the OLD interval, `add_items` the new | red (changes stubbed null) |
| `billing_method` change prepaid → usage_based (key change) → remove(old method)+add(new) | red (changes stubbed null) |
| Free → paid on same feature → remove(free key)+add(paid key) | red (changes stubbed null) |
| Paid → free | red (changes stubbed null) |
| `unlimited` toggle → remove+add (same key) | red (changes stubbed null) |
| `pooled` toggle → remove+add | red (changes stubbed null) |
| Rollover add / change / remove → remove+add | red (changes stubbed null) |
| Proration change on prepaid → remove+add | red (changes stubbed null) |
| `billing_units` / `max_purchase` change → remove+add | red (changes stubbed null) |
| Tier edit (amount, `to` boundary, `flat_amount`) → remove+add | red (changes stubbed null) |
| `tier_behavior` graduated → volume → remove+add; explicit `graduated` with tiers → no diff | red (volume half stubbed; graduated-explicit expects `none`) |
| Item additional-currency amount change → diff; currency add/remove only → no diff | red (amount half stubbed; remove-only expects `none` — compute may still update) |
| Two items same feature, different intervals → only the edited keyed pair diffs, sibling untouched | red (changes stubbed null) |
| Re-send with explicit defaults on items → `item_changes` empty, no customize lanes | ✓ |

### B4. Free trial lane — `preview/changes/changes-free-trial.test.ts`

Red twice over: trial persistence AND changes are unimplemented.

| Case | Status |
|---|---|
| Add trial → `customize.free_trial` = params | red (changes stubbed; trial also not in upsert op → action may stay `none`) |
| `duration_length` / `duration_type` change → diff | red (changes stubbed; trial persistence missing) |
| `card_required` flip → diff; explicit `card_required: true` ≡ omitted → no diff | red (changes stubbed; trial persistence missing) |
| `on_end` change → diff; explicit `"bill"` ≡ omitted → no diff | red (changes stubbed; trial persistence missing) |
| Remove trial (`free_trial: null`) → `customize.free_trial: null` | red (changes stubbed; trial persistence missing) |

### B5. Mixed changes — `preview/changes/changes-mixed.test.ts`

| Case | Status |
|---|---|
| Details + base price + items + trial in one entry → `previous_attributes`, `price_change`, `item_changes`, and all `customize` lanes populated coherently | red (changes stubbed null) |
| Create with full shape → `changes` non-null: `customize` carries entire desired shape (price + add_items), `previous_attributes` null | red (changes stubbed null) |
| Items + price change, details untouched → `previous_attributes` null/empty | red (changes stubbed null) |
| Multi-plan call → each row's `changes` scoped to its own plan | red (changes stubbed null) |

### C. State + versioning — `preview/preview-state-versioning.test.ts`

| Case | Status |
|---|---|
| Plan with attached customer → `has_customers: true`; without → `false` | ✓ |
| Expired-only customers → `has_customers: false` | ✓ |
| Update targeting latest of a 2-version plan → `versioning { current_version: 2, new_version: null, resolved: "existing" }` | red (versioning stubbed null) |
| `versioning.options` lists all three strategies; `new_version` has `available: false` + `reason` while unimplemented | red (versioning stubbed null) |
| `all_versions` on a multi-version plan → one preview row per affected version, each identifiable via `versioning.current_version`, `resolved: "all_versions"` | red (versioning stubbed null; today only one preview row) |

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

### Comparator unit matrix (impl agent owns, listed for completeness)

`freeTrialsAreSame` unit cases: null×null → same; null×set → differ; each
field differing (length, type, card_required, on_end); defaults normalization
(month / card true / on_end bill ≡ omitted); `unique_fingerprint` ignored for
params-side comparison.

## Deferred (later slice)

| Case |
|---|
| `new_version` strategy (currently rejected) |
| `all_versions` + direct per-version override ordering |
| Variants / licenses in catalog params |
| Stripe price re-use on version mint (needs new_version) |
| `create_in_stripe` behavior (currently unused) |
| In-place `updated` EP bucket (never populated today) |
