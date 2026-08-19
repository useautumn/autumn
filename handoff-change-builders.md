# Handoff: Change-builders consolidation (PlanChange kernel + buildBillingChanges)

You are working in a **fresh worktree/stack** off trunk `dev`. This document is self-contained: it includes the schema files you must recreate verbatim, the full research map, frozen wire constraints, and three ordered units of work. Read it fully before writing code.

Use the `stack` skill (GitHub stacked PRs via `gh stack`; trunk is `dev`) for branching. One unit per branch. TDD each unit per the `tdd` skill. Follow the repo rules: named params, concise comments (≤2 lines), readable-code-structure (neat top-level callers, helpers in own files), check `autumn/shared/utils/` before writing inline transforms.

---

## 1. Mission

Today, "change objects" (diffs shown in previews, webhooks, migration results) are constructed in **six places across three domains**. Consolidate to **one canonical builder per change type**:

| Change type | Canonical home (new) |
|---|---|
| Plan definition changes (`PlanChange` kernel) | `server/src/internal/catalogV2/actions/buildPlanChange/` |
| Item changes (`PlanItemChange`) | same folder (part of the kernel) |
| Customer plan changes (`CustomerPlanChange`) | `server/src/internal/billing/v2/actions/buildBillingChanges/` |
| Balance changes | same folder |
| Flag changes | same folder |

`buildBillingChanges` composes the catalog builder for the nested `plan_change` — the same composition style as `getApiCustomerV2` calling `getPlanResponse` (read `server/src/internal/customers/cusUtils/getApiCustomerV2/getApiCustomerV2.ts` for the pattern).

**Absolute constraint: do not change any public wire shape.** Details in §4.

---

## 2. Step 0 — recreate the schema changes (exact contents)

These files exist as uncommitted work in another worktree (`john/catalog-v2-upsert-products-tests`); recreate them EXACTLY in your stack's first branch. If they've since landed on `dev`, skip and just verify contents match.

### 2a. NEW `shared/api/products/components/planChange/itemChange.ts`

```ts
import { z } from "zod/v4";
import { ApiPlanItemV1Schema } from "../../items/apiPlanItemV1.js";

/** One feature item added to or removed from a plan's definition. */
export const PlanItemChangeSchema = z.object({
	action: z.enum(["created", "deleted"]).meta({
		description: "Whether the item was added to or removed from the plan.",
	}),
	feature_id: z.string().meta({
		description: "The ID of the feature that was added or removed.",
	}),
	item: ApiPlanItemV1Schema.meta({
		description: "The plan item snapshot that was added or removed.",
	}),
});

export type PlanItemChange = z.infer<typeof PlanItemChangeSchema>;
```

### 2b. NEW `shared/api/products/components/planChange/planChange.ts`

```ts
import { z } from "zod/v4";
import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import { ApiFreeTrialV2Schema } from "../apiFreeTrialV2.js";
import { PlanItemChangeSchema } from "./itemChange.js";

/** Before/after for the plan's base price. Absent when the base price is unchanged. */
export const PlanBasePriceChangeSchema = z.object({
	previous: ApiPlanV1Schema.shape.price.meta({
		description: "The plan's base price before the change.",
	}),
	current: ApiPlanV1Schema.shape.price.meta({
		description: "The plan's base price after the change.",
	}),
});

/** Before/after for the plan's free trial. Absent when the trial is unchanged. */
export const PlanFreeTrialChangeSchema = z.object({
	previous: ApiFreeTrialV2Schema.nullable().meta({
		description: "The plan's free trial before the change. Null when none.",
	}),
	current: ApiFreeTrialV2Schema.nullable().meta({
		description: "The plan's free trial after the change. Null when none.",
	}),
});

/**
 * Content-level change to a plan definition.
 * Shared kernel for catalog preview and (nested under) customer plan changes.
 */
export const PlanChangeSchema = z.object({
	previous_attributes: z.record(z.string(), z.unknown()).nullable().meta({
		description:
			"Sparse map of scalar plan fields that changed, holding their previous values. Null when the plan is new.",
	}),
	base_price_change: PlanBasePriceChangeSchema.optional().meta({
		description: "Present when the plan's base price changed.",
	}),
	free_trial_change: PlanFreeTrialChangeSchema.optional().meta({
		description: "Present when the plan's free trial changed.",
	}),
	item_changes: z.array(PlanItemChangeSchema).default([]).meta({
		description: "Feature items added to or removed from the plan.",
	}),
	plan: ApiPlanV1Schema.optional().meta({
		description:
			"The plan after the change. Omitted unless the caller expands it.",
	}),
});

export type PlanBasePriceChange = z.infer<typeof PlanBasePriceChangeSchema>;
export type PlanFreeTrialChange = z.infer<typeof PlanFreeTrialChangeSchema>;
export type PlanChange = z.infer<typeof PlanChangeSchema>;
```

### 2c. NEW `shared/api/products/components/planChange/index.ts`

```ts
export {
	type PlanItemChange,
	PlanItemChangeSchema,
} from "./itemChange.js";
export {
	type PlanBasePriceChange,
	PlanBasePriceChangeSchema,
	type PlanChange,
	PlanChangeSchema,
	type PlanFreeTrialChange,
	PlanFreeTrialChangeSchema,
} from "./planChange.js";
```

### 2d. EDIT `shared/api/products/index.ts`

Add (alphabetical position, before `./components/planExpand`):

```ts
export * from "./components/planChange/index";
```

### 2e. EDIT `shared/api/billing/common/customerPlanChange.ts`

Three changes; keep everything else identical:

1. Replace the local `CustomerPlanItemChangeSchema` object definition with an alias:

```ts
import {
	type PlanItemChange,
	PlanItemChangeSchema,
} from "@api/products/components/planChange/itemChange.js";
import { PlanChangeSchema } from "@api/products/components/planChange/planChange.js";

/** @deprecated Use PlanItemChangeSchema. */
export const CustomerPlanItemChangeSchema = PlanItemChangeSchema;
```

(Drop the now-unused `ApiPlanItemV1Schema` import.)

2. In `CustomerPlanChangeSchema`, add `plan_change` before `item_changes` and deprecate `item_changes`:

```ts
	plan_change: PlanChangeSchema.optional().meta({
		description:
			"Content-level change to the plan definition for this customer plan (items, base price, free trial).",
	}),
	item_changes: z.array(PlanItemChangeSchema).default([]).meta({
		deprecated: true,
		description:
			"Deprecated — use plan_change.item_changes. Features that were added to or removed from this plan.",
	}),
```

3. Alias the type:

```ts
/** @deprecated Use PlanItemChange. */
export type CustomerPlanItemChange = PlanItemChange;
```

**Naming decision (settled, do not relitigate):** the webhook's `plan_changes[]` array name stays. The nested kernel field is singular `plan_change` (customer-plan → plan is 1:1; avoids `plan_changes[].plan_changes`). `previous_attributes` on `CustomerPlanChange` (lifecycle scalars: status/canceled_at/…) is a DIFFERENT concept from `PlanChange.previous_attributes` (definition scalars: name/add_on/…) — never merge them.

---

## 3. Research map — every touchpoint that constructs change objects today

### Family A — `CustomerPlanChange` (customer lifecycle)

| Constructor | Path | Notes |
|---|---|---|
| `buildPlanChanges` | `server/src/internal/billing/v2/utils/billingChangeResponse/buildPlanChanges.ts` | THE main builder. `AutumnBillingPlan` → `CustomerPlanChange[]`. Contains critical logic: `collapseSamePlanIdPairs` (merges activate+expire of same plan_id into one `updated`), `mergeUpdatedPlanChanges` (dedupes by merge key), license-parent mapping, action derivation from public status transitions |
| `buildPlanItemChanges` / `buildInternalPlanItemChanges` | `.../billingChangeResponse/buildPlanItemChanges.ts` | cusEnt/cusPrice insert/delete → item_changes via `customerEntitlementToPlanItemV1` |
| `buildPreviousAttributes` | `.../billingChangeResponse/buildPreviousAttributes.ts` | LIFECYCLE scalars (status, past_due, canceled_at, expires_at from ended_at, trial_ends_at) |
| `toCustomerPlanSnapshot` + `cusProductStatusMapping` | same folder | subscription/purchase snapshots |
| `buildBillingChangeResponse` | `.../billingChangeResponse/buildBillingChangeResponse.ts` | Webhook payload wrapper |
| `insertedItemsToPlanChange` | `server/src/internal/migrations/v2/batchOperations/finalize/buildBatchMigrationWebhookRecords/insertedItemsToPlanChange.ts` | PARALLEL hand-rolled constructor (batch webhook lane) |
| `buildAddedPlanChanges` + `buildCreatedItemChanges` | `.../batchOperations/finalize/buildMigrationItemEvent/buildAddedPlanChanges.ts` | PARALLEL hand-rolled constructor (item-add migration events); converts ents → items via `toProductItem` + `productItemsToPlanItemsV1` |
| Migration preview alias | `server/src/internal/migrations/v2/preview/previewMigrateCustomer/buildPlanChanges.ts` | Pure re-export of billing's builder |

Callers: `sendBillingUpdatedWebhook` (`server/src/internal/billing/v2/workflows/sendBillingUpdatedWebhook/`), `buildPreviewMigrateCustomer`, `sendBatchBillingUpdatedWebhooks`, `buildBatchMigrationItemResponses`, `buildBatchMigrationWebhookRecords`.

### Family B — plan definition diff

| Constructor | Path | Notes |
|---|---|---|
| `diffPlanV1` | `shared/utils/planV1Utils/diff/diffPlanV1.ts` | `customize` lanes (price/add_items/remove_items/free_trial/billing_controls). ALSO powers variant customize + migration draft ops — DO NOT MODIFY |
| `diffPlanV1PreviewFields` + `diffPlanV1ItemChanges` + `diffPlanV1PreviousAttributes` | `shared/utils/planV1Utils/diff/diffPlanV1PreviewFields.ts` | Legacy preview bundle: customize + previous_attributes + price_change + item_changes. REUSE internals; do not fork the diff logic |
| `buildCorePlanUpdatePreview` | `server/src/internal/product/actions/previewUpdatePlan/buildCorePlanUpdatePreview.ts` | Legacy wrapper — FROZEN (plans actions being deprecated), leave untouched |

FullProduct → ApiPlanV1 conversion: `getPlanResponse` (`server/src/internal/products/productUtils/productResponseUtils/getPlanResponse.ts`, async) or `fullProductToApiPlanV1` (`server/src/internal/product/actions/common/planTransformUtils.ts`).

### Balance / flag changes (migration preview only)

| Constructor | Path |
|---|---|
| `buildBalanceChanges` | `server/src/internal/migrations/v2/preview/previewMigrateCustomer/buildBalanceChanges.ts` — union feature ids; skip features missing from AFTER; diff tracked fields (granted/remaining/usage/unlimited/next_reset_at); emit `{ feature_id, balance: afterSubset, previous_attributes: sparseBefore }` only when non-empty |
| `buildFlagChanges` | `.../buildFlagChanges.ts` — presence-only created/deleted |
| Types | `.../previewMigrateCustomer/types/` (`previewBalanceChange.ts`, `previewFlagChange.ts`, `previewPlanChange.ts`, `previewMigrateCustomerSchema.ts`) — server-local, NOT in shared |

Callers: `buildPreviewMigrateCustomer.ts` (real before/after via `getApiBalances`), `buildBatchMigrationItemResponses.ts` (batch lane: `beforeBalances/Flags: {}`, synthetic after via `toCustomerItemChanges.ts`).

---

## 4. FROZEN wire shapes — verify with existing tests, zero expectation edits

1. **`billing.updated` webhook** (`shared/api/billing/common/billingChangeResponse.ts`): `{ object, customer_id, entity_id?, plan_changes: CustomerPlanChange[], tags }`. Flat `item_changes` on each change must keep being emitted **byte-identically**. `plan_change` is ADDITIVE (new optional field). Test suites: `server/tests/**/billing-updated*`, `**/billing-change-response*`.
2. **Migration preview response** (`PreviewMigrateCustomer`): `{ object, customer_id, plan_changes, balance_changes, flag_changes }` — schema and field shapes unchanged. Suites under `server/tests/integration/migrations-v2/` (`update-items-preview`, `delete-add-preview`, `versioning-preview`, `state-preservation-preview`, `scheduled-duplicate-items-preview`, `add-plan-op-preview`) + helper `expectMigrationPreviewCorrect.ts`. Unit: `server/tests/unit/migrations-v2/batch-operations/build-batch-item-responses.test.ts`.
3. **Batch Tinybird item events** (`emitBatchMigrationItemEvents.ts`) — shape unchanged.
4. **`DiffedCustomizePlanV1`** — request AND response surface (variant customize, migration draft ops). Untouched.
5. **Legacy `previewUpdatePlan` / catalog v1 preview** — untouched entirely (deprecated soon).
6. Dashboard reader `vite/src/views/migrations/migration/live/EventResultDetail.tsx` reads `subscription`/`purchase`/`item_changes`/`balance_changes`/`flag_changes` — must keep working without edits.

CatalogV2 preview (`shared/api/catalogV2/**`) is NOT yet public — its schemas may change freely.

---

## 5. Unit A — branch `catalog-plan-change`

Create `server/src/internal/catalogV2/actions/buildPlanChange/`:

```
buildPlanChange/
  buildPlanChange.ts             # { from, to: ApiPlanV1 } → PlanChange | null
  buildPlanItemChanges.ts        # two entry forms, see below
  buildBasePriceChange.ts        # from/to → PlanBasePriceChange | undefined
  buildFreeTrialChange.ts        # from/to → PlanFreeTrialChange | undefined
  buildPlanPreviousAttributes.ts # wraps shared diffPlanV1PreviousAttributes
  index.ts
```

Requirements:

- `buildPlanChange({ from, to })`: internally uses shared `diffPlanV1` for lane detection (base price changed ⇔ `customize.price !== undefined`; trial changed ⇔ `customize.free_trial !== undefined`). Returns `null` when nothing changed. All params objects (named-params rule).
- `buildPlanItemChanges` — **two entry forms**:
  - diff form `{ from, to }`: wrap shared `diffPlanV1ItemChanges` (identical output shape, `PlanItemChange` alias).
  - explicit form `{ createdItems, deletedItems }` (each `ApiPlanItemV1[]` with feature ids): assemble `{ action, feature_id, item }` directly. Billing uses this — it already knows created/deleted from `AutumnBillingPlan`; re-diffing snapshots would risk drifting from billing semantics. Implement as two named exports (e.g. `buildPlanItemChangesFromDiff` / `buildPlanItemChangesFromLists`), not one function with a union input.
- `buildBasePriceChange` emits `{ previous: from.price, current: to.price }` only when the price lane changed; same pattern for trial.
- `previous_attributes`: reuse shared `diffPlanV1PreviousAttributes` (keys: id, name, description, group, add_on, auto_enable, free_trial, config, billing_controls). Caller decides null-on-create.
- **Do not modify** `shared/utils/planV1Utils/diff/*` except (optionally, additive) exporting internals if needed.
- Unit tests: `server/tests/unit/catalogV2/buildPlanChange/` — from/to ApiPlanV1 fixtures covering: name-only change, base price add/change/remove, item add/remove, trial add/change/remove, no-op → null, explicit-form assembly.

**Seam note:** wiring this into catalogV2 preview (`preview/plans/buildPlansPreview.ts` `changes` field) is OWNED BY THE ORIGIN WORKTREE (preview restructure lives there uncommitted). Do NOT touch `server/src/internal/catalogV2/actions/updateCatalog/preview/**` or the RED suites under `server/tests/integration/catalog-v2/plans/preview/changes/`. Build the action + unit tests only.

## 6. Unit B — branch `billing-build-changes`

Create `server/src/internal/billing/v2/actions/buildBillingChanges/`:

```
buildBillingChanges/
  buildBillingChanges.ts              # orchestrator → { planChanges, balanceChanges, flagChanges }
  buildCustomerPlanChanges.ts         # moved buildPlanChanges (billing) — logic PRESERVED
  buildLifecyclePreviousAttributes.ts # renamed buildPreviousAttributes
  toCustomerPlanSnapshot.ts           # moved as-is
  cusProductStatusMapping.ts          # moved as-is
  buildBillingChangeResponse.ts       # moved webhook wrapper; calls orchestrator
  billingChangeResponseHasContent.ts  # moved as-is
  buildBalanceChanges.ts              # moved from migrations preview, verbatim logic
  buildFlagChanges.ts                 # moved from migrations preview, verbatim logic
  convert/entitlementsToPlanItems.ts  # cusEnt→ApiPlanItemV1 adapters (extract from buildPlanItemChanges internals)
  types/                              # BalanceChange/FlagChange types relocated from migrations
  index.ts
```

Steps, in order:

1. **Move** `billing/v2/utils/billingChangeResponse/*` here. `buildPlanChanges` → `buildCustomerPlanChanges` (grep confirms the name only collides with the migrations re-export). Preserve `collapseSamePlanIdPairs` / `mergeUpdatedPlanChanges` / license-parent logic EXACTLY — this is a move, not a rewrite.
2. **Nest the kernel**: in `buildCustomerPlanChanges`, wherever flat `item_changes` are computed, also attach `plan_change` built via unit A's explicit form (`buildPlanItemChangesFromLists`). The cusEnt→item conversion already exists in `buildPlanItemChanges.ts` (`customerEntitlementToPlanItemV1`) — extract to `convert/entitlementsToPlanItems.ts` so both the flat and nested fields use it once. Keep emitting flat `item_changes` from the SAME data (wire-identical), plus the additive `plan_change: { previous_attributes: null, item_changes: [...] }` (base_price_change/free_trial_change omitted for billing initially).
3. **Move** `buildBalanceChanges` / `buildFlagChanges` + their types from `migrations/v2/preview/previewMigrateCustomer/`. Keep type names/shapes identical (`PreviewMigrateCustomer` schema must not change; it may keep importing relocated types).
4. **Re-point callers, delete old files**: `sendBillingUpdatedWebhook`, `buildPreviewMigrateCustomer` (delete its local `buildPlanChanges.ts` re-export), `sendBatchBillingUpdatedWebhooks` imports, `migrationWebhookRecord.ts` type import. Grep for `billingChangeResponse` to catch stragglers.
5. Gate: frozen suites §4.1 + §4.2 green with ZERO expectation edits. Run: `cd server && bun test tests/integration/migrations-v2/` and the billing-updated suites.

## 7. Unit C — branch `batch-lanes-fold`

1. `insertedItemsToPlanChange.ts` and `buildAddedPlanChanges.ts`/`buildCreatedItemChanges`: rebuild on the shared constructors — ents → items via `convert/entitlementsToPlanItems.ts` (or `toProductItem` path where entitlements aren't cusEnts — check both input types carefully: batch lanes use `EntitlementWithFeature`, billing uses `FullCustomerEntitlement`), then unit A's explicit form for item changes, then assemble `CustomerPlanChange` with `action: "updated"`, `previous_attributes: {}`, flat + nested item changes.
2. Delete the duplicated assembly code; keep the lane-specific input adapters (they're honest differences, not duplication).
3. Gate: batch migration suites (`build-batch-item-responses.test.ts`, webhook record tests, `expectMigrationItemEvent.ts` consumers) green with zero expectation edits.

---

## 8. Explicitly OUT OF SCOPE (owned by the origin worktree — do not touch)

- `server/src/internal/catalogV2/actions/updateCatalog/preview/**` (restructured there: `buildUpdateCatalogPreview` + `plans/` + `features/`)
- `shared/api/catalogV2/components/catalogPlanUpdatePreview/**` (versioning options reshape + wiring `CatalogPlanChanges` onto the kernel happens there)
- RED suites under `server/tests/integration/catalog-v2/plans/preview/`
- `versioning: "new_version"` mint
- Migration draft builders (`shared/api/catalog/utils/buildMigrationDraft.ts`, vite copy)
- Any rename of the webhook's `plan_changes` field (decided: stays)

## 9. Definition of done

- [ ] Schema files from §2 recreated exactly; `bun run check` (or repo's typecheck) clean in `shared/` and `server/`
- [ ] Unit A: `buildPlanChange` action + unit tests green
- [ ] Unit B: old `billingChangeResponse/` + migration preview builders deleted; all callers re-pointed; frozen suites green untouched; webhook now carries additive `plan_change`
- [ ] Unit C: batch-lane duplicate constructors deleted; batch suites green untouched
- [ ] Three stacked PRs via `gh stack`, trunk `dev`, one unit each, short branch names as above
