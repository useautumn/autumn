# Plan Update Flow Research

## Why This Exists

We want `atmn` and the catalog preview/update APIs to behave more like the dashboard plan editor.

The dashboard now treats most plan edits as one of two intents:

1. **Grandfather existing customers**
   - Create a new catalog version.
   - Existing customers stay on their current version.
   - New attaches use the latest version.

2. **Apply the change in place**
   - Update the current catalog version.
   - Existing customers are not silently mutated by catalog row deletion.
   - If needed, create a migration that moves selected existing customers onto the updated catalog shape.

The main product question for `atmn` is how to expose that same intent clearly when pushing a full catalog.

## Dashboard Save Flow

Source files:

- `vite/src/views/products/plan/components/SaveChangesBar.tsx`
- `vite/src/views/products/plan/versioning/PlanChangeDialog.tsx`
- `vite/src/views/products/plan/versioning/buildMigrationDraft.ts`
- `vite/src/services/products/ProductService.tsx`

### Entry Point

`SaveChangesBar` handles the normal plan save button.

If the edit is onboarding or a metadata-only/simple no-customer edit, it uses the older product update path:

```txt
ProductService.updateProduct -> POST /v1/products/:id
```

If the plan has customers or variants, it opens `PlanChangeDialog` instead of saving directly.

Current gate:

```txt
hasCustomers = counts.all > 0 && !isMetadataOnlyChange
show dialog if hasCustomers || variants.length > 0
```

### Preview

`PlanChangeDialog` builds update params from the edited product:

```txt
buildInPlaceUpdatePlanParams(...)
```

That helper includes:

```txt
disable_version: true
```

But the preview deliberately deletes `disable_version` before calling the backend:

```txt
ProductService.previewUpdate -> POST /v1/plans.preview_update
```

Reason: preview should answer "would this update version under normal versioning rules?".

The preview returns:

- `has_customers`
- `versionable`
- `customize`
- `previous_attributes`
- `price_change`
- `item_changes`
- `variants`

The dialog uses this to show item/price changes and variant propagation conflicts.

### User Choice

The dashboard asks:

- **Create new version**
  - Existing customers stay on their current version.

- **Update existing version**
  - Update the current plan version now.
  - If preview says the change is `versionable`, the next step can create a migration.

This is the core product model:

```txt
grandfather customers -> create new version
apply to current version -> disable_version true, then optionally migrate users
```

### Applying The Edit

For **Update existing version**:

```txt
POST /v1/plans.update
body.disable_version = true
```

For **Create new version**:

```txt
POST /v1/plans.update
body.disable_version omitted
```

Selected variants are passed through `update_variant_ids`.

### Migration After In-Place Update

The dialog only needs a migration when:

```txt
versionChoice === "update" && preview.versionable
```

That means:

- The user chose to patch the current version in place.
- The backend says the change would normally require versioning.
- Current customers therefore need an explicit migration if we want them to receive the changed item/free-trial/billing-control shape.

For this combined base/variant flow, the dashboard builds one migration with `buildCombinedVariantMigrationDraft`.

The operation is not a detailed `customize` patch. It groups target plan IDs by current version and emits `update_plan` operations with `version`, which resets matching customer products to the current catalog version.

The dialog then creates the migration and navigates to:

```txt
/migrations/:id?step=live&run=true
```

The user may also skip migration, leaving existing customers on their current materialized rows.

## Dashboard Existing-Version Migration Flow

Source files:

- `vite/src/views/products/plan/components/EditPlanHeader.tsx`
- `vite/src/views/products/plan/versioning/MigrateCustomersDialog.tsx`
- `vite/src/views/products/plan/versioning/buildMigrationDraft.ts`

This is a separate flow for after a plan already has multiple versions.

The header computes past versions with active customers and compares each old version to latest. Versions with no diff are disabled.

The dialog lets the user migrate:

- all migratable past versions
- one specific past version

It creates a migration with `buildVersionMigrationDraft`.

That migration uses:

```txt
operation.type = update_plan
operation.version = latestVersion
```

Customers on custom plans are excluded unless the caller opts in.

## Backend Plan Preview

Source files:

- `server/src/internal/products/handlers/handlePreviewUpdatePlan/handlePreviewUpdatePlanV2.ts`
- `server/src/internal/product/actions/previewUpdatePlan/previewUpdatePlan.ts`
- `server/src/internal/product/actions/previewUpdatePlan/planWouldVersion.ts`
- `server/src/internal/product/actions/previewUpdatePlan/hasPlanCustomers.ts`

The public route is:

```txt
POST /v1/plans.preview_update
```

The handler delegates to `previewUpdatePlan`.

Preview loads the base plan, builds the incoming product shape, checks customer usage, and then calls `buildPlanUpdatePreview`.

The important versioning rule is in `planWouldVersion`:

- `force_version` -> `versionable: true`
- `disable_version` -> `versionable: false`
- no versionable customers -> `versionable: false`
- billing-controls-only change -> can version
- items/free-trial/billing-controls changes -> version if not same
- scalar details alone do not version

`hasPlanCustomers` is currently based on `customerProductRepo.getVersioningUsageForProduct`, not raw historical usage. That means `has_customers` and `versionable` are about customer products in versionable statuses, not expired-only history.

## Backend Plan Update

Source files:

- `server/src/internal/products/handlers/handleUpdatePlan/handleUpdatePlanV2.ts`
- `server/src/internal/product/actions/updateProduct.ts`
- `server/src/internal/product/actions/updateProduct/setupUpdateProductContext.ts`
- `server/src/internal/product/actions/updateProduct/updateProductItems.ts`
- `server/src/internal/product/actions/inPlaceUpdateUtils.ts`

The public route is:

```txt
POST /v1/plans.update
```

The handler maps API plan params to ProductV2 params and calls:

```txt
updateProduct({ query: { force_version, disable_version }, ... })
```

### Versioning Branches

`updateProduct` rejects `force_version && disable_version`.

Then it loads:

- current full product
- reward programs
- current ProductV2 shape
- customer usage for the current internal product version

Current decision behavior:

- `force_version` always creates a new version.
- If versionable customers exist and `disable_version` is false, item/free-trial changes create a new version.
- If versionable customers exist and `disable_version` is false, billing-controls-only changes create a new version.
- Otherwise the update is applied to the current product.

### In-Place Item Edits

If `updates.items` is present and any customer product references the current internal product, `updateProductItems` uses the in-place edit path.

That path:

- backfills existing item IDs where possible
- detects updated or deleted catalog item rows
- marks referenced prices/entitlements as `is_custom: true`
- deletes unreferenced prices/entitlements
- inserts new replacement catalog rows

This means an in-place catalog update does not delete rows under existing customers. Customers keep their current materialized rows until a migration moves them to the updated catalog version.

## Catalog Preview/Update Today

Source files:

- `shared/api/catalog/previewUpdateCatalogParams.ts`
- `shared/api/catalog/previewUpdateCatalogResponse.ts`
- `server/src/internal/catalog/actions/previewUpdateCatalog/previewUpdateCatalog.ts`
- `server/src/internal/catalog/actions/previewUpdateCatalog/previewCatalogPlanUpdate.ts`
- `server/src/internal/catalog/actions/updateCatalog/updateCatalog.ts`

Routes:

```txt
POST /v1/catalog.preview_update
POST /v1/catalog.update
```

Catalog params include:

- `features`
- `plans`
- `skip_deletions`
- `skip_feature_ids`
- `skip_plan_ids`
- `expand`
- `create_migration`

Per-plan params use the same `disable_version` and `force_version` semantics as `plans.update`.

### Catalog Preview

`catalog.preview_update` batches context setup, virtually applies feature changes, then previews plan changes using the same `buildPlanUpdatePreview` path as `plans.preview_update`.

The response shape is:

```txt
{
  plan_changes: CatalogPlanPreview[],
  feature_changes: CatalogFeaturePreview[]
}
```

Each plan change has:

- `action`
- `will_archive`
- all plan preview fields from `PlanUpdatePreview`

Plan actions:

- `created`
- `updated`
- `deleted`
- `skipped`
- `none`

### Catalog Update

`catalog.update` applies in this order:

1. Load products before update.
2. Upsert features.
3. Upsert plans.
4. Apply missing plan removals when `skip_deletions` is false.
5. Apply missing feature removals when `skip_deletions` is false.
6. Resolve response.

Plan upserts delegate to `updateProduct`, so the same versioning and in-place semantics apply.

If `params.create_migration && plan.disable_version`, catalog update captures the before/after plan diff and inserts a migration draft when the updated current product has versionable customers and a diff.

Current catalog migration draft uses:

```txt
scope: "all_customers"
```

That is close to the dashboard's "update existing version, then migrate current users" path, but it is not yet as expressive as the dashboard UI around selecting variants/custom customers.

## atmn Push Today

Source files:

- `packages/atmn/src/commands/push/push.ts`
- `packages/atmn/src/commands/push/headless.ts`
- `packages/atmn/src/lib/hooks/usePush.ts`
- `packages/atmn/src/commands/push/prompts.ts`
- `packages/atmn/src/lib/api/endpoints/catalog.ts`

`atmn` now calls:

```txt
catalog.preview_update
catalog.update
```

It builds params from local features/plans:

```txt
skip_deletions: false
skip_feature_ids: [...]
skip_plan_ids: [...]
plans: toCatalogPlanParams(...)
features: toCatalogFeatureParams(...)
```

It uses `preview.plan_changes` and `preview.feature_changes` to build the push summary and prompt list.

For versionable plan updates, the current prompt model is:

- sandbox default: "migrate existing customers and create a new version"
- live default: "create a new version only"
- skip this plan

After `catalog.update`, `atmn` can call `migrateProduct` for selected versioned plans. Today that migrates from the immediately previous version to the new latest version.

This does not yet match the dashboard's main save flow exactly:

- dashboard has an explicit "update existing version" choice
- dashboard sends `disable_version: true` for that choice
- dashboard creates a migration from the in-place updated catalog shape
- atmn currently mostly models "version, optionally migrate old version to latest"

## Useful Mental Model For Future atmn Work

For each changed plan, `atmn` probably needs to choose an intent:

1. **Create new version**
   - Send no `disable_version`.
   - Existing customers are grandfathered.
   - Optional follow-up migration can move selected existing versions to latest.

2. **Update existing version and migrate**
   - Send `disable_version: true`.
   - Send or derive `create_migration: true`.
   - Existing customers can be moved to the updated current catalog version.

3. **Update existing version without migration**
   - Send `disable_version: true`.
   - Do not create/run migration.
   - New attaches see the changed catalog; existing customers keep materialized rows where item rows were retired.

4. **Skip**
   - Add the plan to `skip_plan_ids`.

This is the vocabulary that maps most closely to dashboard behavior.

## Open Questions Before Changing atmn

1. Should `catalog.preview_update` return a migration preview/draft for `disable_version` updates, so `atmn` does not reconstruct migration intent locally?

2. Should `catalog.update` create migrations only as drafts, or should `atmn` still own whether to run them immediately?

3. Should catalog migration options support the dashboard's custom-plan inclusion choice?

4. Should catalog migration options support migrating only a specific version, or is "all current customers on this plan" enough for push?

5. Should the default atmn choice differ by environment?
   - Sandbox could default to update-and-migrate.
   - Live probably should default to create-version/grandfather.

6. How should variant propagation combine with in-place migrations?
   - Dashboard creates one migration over the base plan plus selected variants.
   - Catalog update currently has a simpler per-plan migration path.

## Proposed Documentation Framing

Use this phrasing externally:

- **Create a new version** when you want to grandfather existing customers.
- **Update the current version** when you want the catalog definition itself to change.
- **Migrate customers** when you want existing customers to receive the updated current-version shape.

Avoid saying that in-place updates automatically mutate existing customers. The backend preserves referenced rows; migration is the explicit step that moves customers onto the updated shape.
