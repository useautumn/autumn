## Updated Test-First Plan (with itemsV2, typed inputs, and V1_Beta gate)

  ### Summary

  Sequence will be:

  1. Add test scaffolding first (including new itemsV2 fixture file).
  2. Add new v2Params integration tests with typed request inputs.
  3. Implement request-versioning and internal param migration to pass tests.
  4. Fix remaining low-hanging type errors and run bun ts.

  ### Confirmed Constraints Applied

  1. New fixture module will be a new file:

  - server/tests/utils/fixtures/itemsV2.ts

  2. New test files must be exactly:

  - v2-customize.test.ts
  - v2-free-trial.test.ts

  3. Typed request-call pattern in tests:

  - autumnV2.billing.attach<..., AttachParamsV1Input>(...) style
  - autumnV2.subscriptions.update<..., UpdateSubscriptionV1ParamsInput>(...) style
    (using the same generic-template pattern as CRUD plan tests)

  4. versionedBody previous version gate:

  - use ApiVersion.V1_Beta (not ApiVersion.V2_0)

  ———

  ### Phase 1: Add Fixtures and Test Files First

  #### 1. New fixtures file

  Create server/tests/utils/fixtures/itemsV2.ts with V1-item builders suitable for customize.items, mirroring existing fixture ergonomics:

  - itemsV2.monthlyPrice(...)
  - itemsV2.monthlyMessages(...)
  - itemsV2.monthlyWords(...)
  - itemsV2.dashboard(...)
  - any minimal helpers needed for your specified edge cases

  These will return shapes compatible with V1 plan-item input (CreatePlanItemParamsV1 shape), not legacy product-item shape.

  #### 2. Attach tests

  Create:

  - server/tests/integration/billing/attach/v2Params/v2-customize.test.ts
  - server/tests/integration/billing/attach/v2Params/v2-free-trial.test.ts

  v2-customize.test.ts coverage:

  - customize with both price + items
  - customize with only price
  - customize with only items
  - 1-2 edge cases validating planItemsV1 -> internal product-item transform behavior through outcomes (preview total, customer feature state, invoice/subscription consistency)

  v2-free-trial.test.ts coverage:

  - 1-3 tests validating transformation correctness from legacy trial shape to V1 behavior (set/remove/preserve as needed)

  #### 3. Update-subscription tests

  Create:

  - server/tests/integration/billing/update-subscription/v2Params/v2-customize.test.ts
  - server/tests/integration/billing/update-subscription/v2Params/v2-free-trial.test.ts

  Same scenario matrix as attach for customize and free-trial transform correctness.

  ———

  ### Phase 2: Implement Versioning and Param Migration

  #### 1. Shared request schemas

  - Finalize attach V1 params to rely on customize (no top-level items in V1 schema).
  - Add/update update-subscription V1 params schema with customize + V1 free_trial.

  #### 2. Request change files (v0 -> v1 body mapping)

  Add request-change classes for attach/update that map:
  - free_trial.length/duration -> free_trial.duration_length/duration_type
  Register these in version change registry.

  Update handlers (attach/update + previews) to use:

  - latest: V1 schema
  - [ApiVersion.V1_Beta]: V0 schema
    with correct resource for request-change application.

  #### 4. Internal billing v2 updates

  Refactor attach/update internal action graph to read:
  No broader behavior changes beyond these two params.

  ———

  ### Phase 3: Type-Error Cleanup and Verification

  1. Run bun ts in server/.
  2. Fix low-hanging caller type mismatches surfaced by migration (including preview/checkout-adjacent paths if impacted by these param types).
  3. Run new v2Params test files individually.
  ———

  ### API / Interface Changes

  - New request-change classes for attach/update body transforms
  - Handlers switched to version-aware body validation with V1 latest and V1_Beta legacy gate

  ———

  ### Acceptance Criteria

  1. All four v2Params test files exist with required names and scenario coverage.
  2. Tests use itemsV2 fixtures and typed generic input-call pattern.
  3. versionedBody uses ApiVersion.V1_Beta as legacy schema key.
  4. Attach/update endpoints correctly transform legacy free_trial and items into V1 format.
  5. bun ts passes in server/.