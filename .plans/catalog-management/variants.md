# CatalogV2 variants

Variants stay one more `UpsertProductPlan` fanout — same unit as licenses.
`all_versions` is target versioning, not a second hop.
Child → variant-parents needs a test only.

```
plans[] base
   │ fold own content
   ▼
deriveVariantIntents
   │  variants[] + name, missing  → create (variant_link)
   │  propagate.variants          → follow + editDiff (variant_propagation)
   │  variants[] customize only   → overlay, no base items
   │  omitted                     → no write (frozen)
   │  base minted                 → pointer write on every latest variant
   ▼
same worklist / same EP + details + trial planners
   │
   ▼  (after every plan has nextFullProduct)
computePlanLicensesPlan   ← already runs on whatever parents are in the batch
```

`editDiff` is already on the intent (`productUpsertIntent.ts:21`) and already
passed through compute. The function body ignores it. `applyDiff` already
patches items **and** `upsert_licenses` without replacing the whole license
set (`applyDiff.ts:175-257`).

Related: `ai/plans/catalog-management/variant-license-model.md` (one-home
shape). Spec lives in `server/tests/integration/catalog-v2/plans/CASES.md`
§21 as units land.

## Already built — do not redo

- Params: `variants[]`, `propagate.variants[]` with `version` / `versioning`
- Sources: `variant_propagation`, `variant_link`, `repoint`
- `deriveVariantIntents` returns `[]`
- Setup does **not** load a base’s variants (only payload ids + license parents)
- Preview has `license_parents` / `sibling_versions`, no `variants` nest
- `applyProductDetailsUpdate` does not write `base_internal_product_id`
- V1 `updateVariants` already re-points latest variants when the base mints
  (`updateVariants.ts:131-155`)

## Locked rules

| | |
|---|---|
| `variants[]` | Declare overlay / create. **Not** a full-set replace (unlike `licenses[]`). Omit a variant = leave it alone, not delete it. |
| `propagate.variants` | Follow. Presence is follow; customize stays on `variants[]`. |
| Omitted from both | Frozen. Variant has its own rows, so no write. Exception: pointer on base mint. |
| Direct `plans[]` row for an existing variant | Allowed (own name / items / billing controls). First claim wins over derive. |
| Create | Only via `base.variants[]` + `name`. Nested variant → 400. |
| `all_versions` on a propagate target | Expand that variant’s historical versions. **Not** `variants[].propagate`. |
| Child → Team + Team-EU | Existing license derive. **No new variant code.** |
| Base license → following variant | `upsert_licenses` **diff**, not a copy of Team’s `licenses[]`. |
| Nested hop (Seat → Team-EU → Team’s variants) | Out of scope. |
| `remove_licenses` / unlink | Out of scope. |

Overlapping item slot (base edits messages, variant already overrode or
stripped it): **apply the diff** (V1 OOTO-IWTN). Preview lists the conflict;
it does not 400. Untouched slots keep drift (100 vs 200 + new boolean).

Billing controls: follow **listed** `propagate.variants` only. V1 silently
patched every variant — V2 does not.

## TDD

Per unit: add the §21 rows in `CASES.md` → write the tests (~3 per file) →
`bun ts` → `bun t <file> --headless` → implement only that unit → flip `✓`.

Suggested first PR: Unit 0 (models), then Unit 1. Unit 7’s test can run
against current code as a cheap probe — it should already pass.

---

## Unit 0 — Data models

No `catalogV2.update` behavior. Lock the row, the edges, the request/response
types, and the upsert/preview fields so Units 1–9 write into a finished shape.

Two different columns. Do not mix them.

```
products
  id:                        "team-eu"          plan id (shared across versions)
  version:                   1
  internal_id:               "prod_eu_v1"       this row
  base_internal_product_id:  "prod_team_v2" ──► products.internal_id
                                                ALWAYS the latest base ROW
  base_variant_id:           "team"             LEGACY plan-id string
                                                (Stripe / yearly). Do not use.
```

`FullProduct.variants` is children pointing at **this row**, not the whole
family. Team v1 and Team v2 each have their own list. Setup (Unit 1) must
query by every base `internal_id` in the family, like V1
`listVariantsByParent`.

| Layer | Status | Fix in this unit |
|---|---|---|
| DB `base_internal_product_id` | Column + index. No FK. | Leave. No migration. Delete/mint re-points in later units. |
| Zod `Product.base_internal_product_id` | `nullable().optional()` | Tighten to `nullable()` (same as `base_variant_id`). |
| `PRODUCT_DETAIL_KEYS` | Missing the pointer | Add it + comparator, so a pointer change is a details write. |
| `initProductRow` | Always `null` | Accept the pointer (create clones base content, then sets it). |
| `planParamsToProductRowPatch` | No pointer | Not a request field. Compute sets it on the stamp; patch only if we add an internal field. Prefer setting on the product stamp in details compute. |
| `applyProductDetailsUpdate` | Does not persist the pointer | Add the column to the update payload. |
| `UpdateCatalogPlanParams.variants[]` | Exists | Keep. `customize` is `CustomizePlanV1` (items, licenses, trial, controls). |
| `propagate.variants[]` | Exists, same target as license_parents | Keep. Nested `variants[].propagate` stays out of schema. |
| GET `ApiPlanVariantV1.customize` | `VariantCustomizeSchema` (computed `diffPlanV1`) | Keep as computed read shape. Do not unify with input. |
| `UpsertProductPlan` | `declaredLicenses` + `propagate`. No `declaredVariants` | Add `declaredVariants?: CatalogVariantParams[]`. Copy from `planParams.variants` on `source === "direct"` only (not `all_versions` siblings). |
| Sources | `variant_link` / `variant_propagation` / `repoint` already exist | Keep. |
| `editDiff` on the intent | Typed, unused in compute | Keep. Follow (Unit 2) uses it. |
| `baseInternalProductId` on the intent | Missing | Add. Derive stamps it; `computeUpsertProductPlan` reads `intent` and passes it to details. |
| Preview | No `variants` nest | Add `CatalogVariantPreviewSchema` + `variants[]` on `CatalogPlanUpdatePreviewSchema`. `variant_action`: `unchanged` \| `propagated` \| `explicit` (same words as `license_action`). |
| `ProductStatesContext` | No family index | None. Variants are more plans in `versionsByPlanId`. |

**Customize split (lock this):**

| Path | Type | Why |
|---|---|---|
| `variants[].customize` (write) | `CustomizePlanV1` | Plan overlay, including the variant's own `upsert_licenses`. |
| Follow `editDiff` (in memory) | `DiffedCustomizePlanV1` + `upsert_licenses` | Base→variant content + license DIFF (Units 2, 8). |
| GET `variant.customize` | `VariantCustomizeSchema` | Computed diff vs latest base. Not what you POST back. |

`variants[]` is **not** a full-set replace. Omit a variant = leave it. `licenses[]` stays the after-set of links.

| Case | Expect |
|---|---|
| `Product.base_internal_product_id` parses `null` and a string, not `undefined` | Zod |
| Pointer in `PRODUCT_DETAIL_KEYS` → `productDetailsAreSame` is false when only the pointer moves | Unit |
| `declaredVariants` on a direct upsert, absent on an `all_versions` sibling | Type + copy site |
| Preview schema accepts `variants: [{ plan_id, version, variant_action, ... }]` | Zod |
| `CatalogVariantParams.customize` accepts `add_items` and `upsert_licenses` | Zod (CustomizePlanV1) |

Tests: `server/tests/unit/catalogV2/variants/` (schema + details compare). No integration.

---

## Unit 1 — Create + load + guards

First green test: `variants: [{ variant_plan_id, name }]` exists and
`base_internal_product_id` points at the base row.

**Setup:** load every variant plan of payload bases (all versions), plus ids
in `variants[]` / `propagate.variants`. Same pattern as `licenseParentPlanIds`
in `setupProductStatesContext.ts`.

**Compute:** `deriveVariantIntents` emits `variant_link` creates.
`initProductRow` sets `base_internal_product_id`. Clone items / trial /
billing controls from `base.next`. `is_default: false`.

| Case | Expect |
|---|---|
| Existing base + `variants[{ id, name }]` | Variant v1, pointer set, items match base |
| Same call: create base + variant | Both exist, pointer set |
| `variants[]` customize on create | Clone + overlay |
| Variant of a variant | 400 `NestedVariantNotAllowed` |
| Id collision | 400 |
| Missing `name` on a new id | 400 |
| `is_default: true` on a variant | 400 `VariantCannotBeDefault` |

Tests: `plans/variants/create/` (~2 files). Flip CASES.md §21.

---

## Unit 2 — Four states (follow / pin / declare)

Wire `editDiff`: `diffPlanV1(base.current, base.next)` on the follow intent;
`computeUpsertProductPlan` applies it via `applyDiff` then the existing EP
planner.

| | `propagate.variants` | `variants[]` customize | Result |
|---|---|---|---|
| Pin | no | no | Variant unchanged |
| Follow | yes | no | Apply base diff; keep untouched drift |
| Declare only | no | yes | Overlay on **current** variant; do not take new base items |
| Follow + declare | yes | yes | New base + that customize exactly (V1 `buildVariantTargetPlan`) |

**Conflict (follow + declare)** — same story as child edit + `propagate.license_parents` + parent `licenses[]` customize.

The base change and `variants[].customize` can both touch the same slot (Team messages 100→150, Team-EU customize 300). Declared customize wins the slot. Follow still applies the rest of the base diff (new items, other licenses). Preview lists no child-edit conflict — `variant_action: "explicit"` swallowed it, same as `license_action: "explicit"` omits `license_parents[].conflicts`.

Follow-only (no `variants[]` customize) is the other side: `applyDiff` overwrites the overlapping slot, preview lists `value_divergence`, no 400.

| Case | Expect |
|---|---|
| Team 100 msgs, Team-EU 200; add Dashboard + propagate | Team-EU = 200 + Dashboard |
| Same setup, omit from propagate | Team-EU still 200, no Dashboard |
| Declare `customize` messages 300, no propagate | 300, no new base items |
| Follow + declare messages 300 (conflict) | New base items + 300; no 400 |
| Base edits messages 100→150; variant had 200; follow only | 150 (applyDiff); preview conflict later |
| Direct `plans[]` on Team-EU + base also follows it | Direct wins (first claim) |

Tests: `plans/variants/follow/` — pin, follow-keep-drift, declare-vs-follow, follow+declare conflict.

---

## Unit 3 — Settings / billing controls

Base `billing_controls` (and description / group / metadata — **not** name)
apply only to variants in `propagate.variants`.

| Case | Expect |
|---|---|
| Base billing_controls + listed variant | Variant columns match |
| Same change, variant omitted | Variant columns unchanged |
| Base rename + propagate | Variant **name** unchanged |

Tests: `plans/variants/settings/` (1 file).

---

## Unit 4 — Pointer on base mint

`base_internal_product_id` always points at the **latest** base row. V1
already does this in execute (`moveLatestVariantsToBaseVersion`). V2: compute
puts the new id on each latest variant; execute must persist it
(`applyProductDetailsUpdate` is missing that column today).

Pinned variants still get a `repoint` write — content frozen, pointer moves.

| Case | Expect |
|---|---|
| Base `new_version`, variant pinned | Latest variant pointer → new base `internal_id`; items unchanged |
| Base `new_version` + follow | Pointer + content diff |
| Historical variant v1 | Pointer stays on the old base row (V1: latest variant rows only) |

Tests: `plans/variants/pointer/` (1 file).

---

## Unit 5 — Target versioning (`all_versions` nest)

This is the only “nested” flow in scope.

```
base edit
  → deriveVariantIntents(variantA, versioning: all_versions)
      → variantA latest  (editDiff)
      → variantA v1, v2, …  (same editDiff)
```

Reuse sibling expansion. Today `deriveVersionSiblingIntents` only runs for
`source === "direct"` — lift that for `variant_propagation` (or emit the
siblings from `deriveVariantIntents`). Do **not** add `variants[].propagate`.

Mirror license F-cases:

| Case | Expect |
|---|---|
| `existing` (default), customers only on variant v1, follow latest | Latest only; v1 frozen |
| `all_versions`, customers on v1 only | v1 + latest get the diff |
| `all_versions`, v1+v2 same diff | Both written (draft collapse is Unit 9) |
| `new_version` on the variant target, latest has customers | Mint variant max+1 (same rule as `deriveLicenseParentMintIntents`) |
| `new_version` + `draft` | 400 (already a versioning guard — extend it to `propagate.variants[]` like `license_parents`) |

Tests: `plans/variants/versioning/` (~2 files).

---

## Unit 6 — Preview

`buildVariantsPreview` on the base row, same shape as
`buildLicenseParentsPreview`. Always list every variant (atmn checkboxes).
`selected` = in `propagate.variants`. Conflicts = existing
`detectCatalogConflicts` (already wraps `detectVariantConflicts`).

| Case | Expect |
|---|---|
| Base edit, two variants, one listed | Both rows; only listed has `plan_change` |
| Value divergence (follow only) | `conflicts` present; not 400 |
| Follow + declare (conflict) | `variant_action: "explicit"`, `conflicts` omitted — declared swallowed the base-edit slot |
| Preview equals update minus `id`; preview writes nothing | Same as G6 for licenses |

Tests: `plans/variants/preview/` (1 file). Schema: add `variants` to
`CatalogPlanUpdatePreviewSchema`.

---

## Unit 7 — Child → variant parents (test only)

No `deriveVariantIntents` work. Seat is offered by Team (base) and Team-EU
(variant). `propagate.license_parents: [team, team-eu]`.

If this is already green, stop. If red, fix **setup load** only (Team-EU must
already appear on `parent_plan_licenses`).

| Case | Expect |
|---|---|
| Seat 10→200, both parents follow | Both links effective 200 |
| Seat 10→200, only Team-EU listed | Team frozen, Team-EU 200 |
| Assigned seats on Team-EU | Same retire rules as today; no new code |

Tests: `plans/variants/licenses/child-to-variant-parents.test.ts`.

---

## Unit 8 — Base license → following variant (the DIFF)

Team has `devSeat` @ 100. Team-EU has `devSeat` @ 200. Add a boolean to
Team’s license and `propagate.variants: [team-eu]`.

```
Team license after:     100 msgs + Dashboard
Team-EU license after:  200 msgs + Dashboard     ← upsert_licenses customize, not licenses[]
```

`editDiff` from `diffPlanV1` already emits `upsert_licenses`. `applyDiff`
already patches one slot and leaves the rest. Do **not** set
`declaredLicenses` on the variant (that is a full replace).

| Case | Expect |
|---|---|
| Add boolean on Team license + follow | Team-EU keeps 200, gains boolean |
| Team declares a new license + follow | Team-EU gains that link (upsert add) |
| Team license change, Team-EU omitted | Team-EU license unchanged |
| Same-slot: Team messages 100→150, Team-EU 200 | ApplyDiff on that slot (150) |

Tests: `plans/variants/licenses/base-license-to-variant.test.ts`.

---

## Unit 9 — Migration drafts

Same draft builder. A following variant with direct customers is an **own**
target (`resolveOwnMigrationTarget` on the variant upsert). A license DIFF
on a following variant is an `upsert_licenses` parent op (already the
license-draft shape).

| Case | Expect |
|---|---|
| Base item change + follow, both have customers | 1 draft, 2 ops (base items + variant items) or 1 op if customize matches |
| Pin variant | No variant op |
| Unit 8 license DIFF + Team-EU has customers | Team-EU op is `upsert_licenses` customize (200 stays, boolean added) |
| Variant `new_version` | No draft |

Tests: `plans/migrations/variants/`. Do not run the draft here unless
license Unit 5 is already in.

---

## Out of scope (whole feature)

- `variants[].propagate` (Seat → seat-eu → Team)
- Unlink (`base_plan_id: null`)
- `remove_licenses` on drafts
- `all_versions` as a replayed version-diff (already deferred for siblings — PUT is fine)
- Variants of variants
