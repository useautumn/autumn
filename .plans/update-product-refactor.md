# Update Product Refactor Plan

## Summary

`server/src/internal/product/actions/updateProduct.ts` has accumulated several intertwined flows: setup, validation, versioning decisions, direct persistence, in-place item edits, variant propagation, and side effects.

The goal is to refactor the structure without changing behavior, so the top-level action becomes easier to audit and future changes can be made in small, safe passes.

## Target Shape

Organize `updateProduct` around the same broad flow used by cleaner billing actions:

1. **Setup**
   - Load the current full product.
   - Load reward programs and default-plan context.
   - Load customer-product usage for the current internal product version.
   - Build any base-product context needed for variant propagation.

2. **Validate**
   - Reject incompatible version flags such as `force_version` with `disable_version`.
   - Validate default-plan changes.
   - Validate which settings a variant update is allowed to change.

3. **Compute**
   - Build the proposed product state.
   - Decide whether the update is a no-op.
   - Decide whether to version, update in place, or persist items normally.
   - Decide whether metadata, free trial, variants, Stripe init, or reward side effects are needed.

4. **Execute**
   - Persist product details.
   - Persist metadata fanout.
   - Persist item changes.
   - Persist free trial changes.
   - Apply variant updates.
   - Run Stripe initialization and reward migration side effects.

## Incremental Plan

### Pass 1: Utility Scaffold Only

Add utilities under:

```txt
server/src/internal/product/actions/updateProduct/
```

Do not wire them into the top-level `updateProduct.ts` yet.

Suggested files:

- `types.ts`
- `setupUpdateProductContext.ts`
- `validateUpdateProductRequest.ts`
- `computeUpdateProductPlan.ts`
- `persistUpdateProductItems.ts`
- `applyUpdateProductSideEffects.ts`

This pass should be audit-only: helpers mirror the current logic, but runtime behavior does not change.

### Pass 2: Wire Setup And Validation

Move setup and validation calls into the new utilities.

Keep all persistence and ordering exactly as it is today.

### Pass 3: Wire Compute

Move the versioning and branch decisions into a compute helper that returns an explicit plan.

The top-level function should read like:

```ts
const setup = await setupUpdateProductContext(...);
validateUpdateProductRequest(...);
const updatePlan = computeUpdateProductPlan(...);
await executeUpdateProductPlan(...);
```

No behavior should change in this pass.

### Pass 4: Wire Execution

Move persistence branches into execution helpers one at a time:

- product details
- metadata
- item updates
- free trial updates
- variants
- side effects

Preserve the current ordering until tests cover any intentional ordering change.

## Behavior To Preserve

- Updating with both `force_version` and `disable_version` throws.
- If customers are on the current version and `disable_version` is false, item or free-trial changes can create a new version.
- If customers are on the current version and `disable_version` is true, item changes use the in-place edit path.
- In-place item edits retire referenced shared rows by marking them custom, then insert replacement rows.
- Product setting updates currently apply directly to the product row.
- Metadata updates fan out by external product ID.
- Variant propagation keeps its current behavior.
- Stripe init and reward migration side effects keep their current behavior.

## Test Plan

Before wiring behavior-changing-looking code, run the focused product update tests:

- plan CRUD update tests
- in-place update tests
- variant update tests

After each wiring pass, run the same focused group again.

Only broaden to catalog or atmn tests if the pass touches catalog-facing schemas, preview behavior, or variant push/pull behavior.

## Assumptions

- The first pass should not modify `updateProduct.ts`.
- The refactor should avoid semantic fixes until the behavior is explicitly tested.
- Any future ordering cleanup should be a separate change with its own tests.
