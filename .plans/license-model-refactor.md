# License Model Refactor

Working doc for the licenses descope + `license_quantities` groundwork
(branch `john/license-descope`). Records the model we've settled on, what's
implemented, and what's left.

## The model

Two tables, two questions:

- **`plan_license`** — a fact about the **plan**: "Team offers 2 Seats."
  Catalog links only going forward (customer-scoped overrides are being
  descoped with the customize cut).
- **`customer_licenses`** — a fact about the **customer**: "Acme has a 2-seat
  pool, 1 remaining." This is the **source of truth for what a customer has**
  (assignability, inventory, list, quantities). No pool row = customer has
  nothing, even if the plan offers it — same relationship as plan items vs
  `customer_entitlements`.

**Pool creation is eager where O(1), lazy where O(customers):**

- Attach/insert → pools are initialized with the parent customer product
  (`initCustomerLicenses` inside `initFullCustomerProduct`, inserted by
  `insertNewCusProducts`).
- Catalog link edits → NO fan-out backfill, and (as of the pools-only gate)
  NO lazy auto-materialization either: adding a link to a plan with existing
  customers does NOT give them pools. Fully the customer_entitlements model —
  plan facts don't propagate to existing customers without an explicit
  migration/backfill (story TBD, likely migrations-v2). `included` changes DO
  propagate for customers that already have the pool (reconcile converges
  granted on their next touch).

**`customer_licenses.plan_license_id`** — every pool is linked to the
plan_license it instantiates; that link is where the license's effective
FullProduct definition is read from (via `license_prices`/`license_entitlements`
when `plan_license.customized`, else the license product's base items).
Rules:

- Written by every pool creator (init, `upsertGranted` via reconcile and the
  take path) — all creators already hold the definition.
- `ON DELETE SET NULL`: a NULL means "link removed, pending cleanup" —
  orphans are an explicit, queryable state.
- Reconcile treats the column as OUTPUT, not input: it re-resolves the
  definition from `(parent cus product → plan, license product)` and corrects
  the column. A stale value can never mint wrong seats.

**In-place license plan edits propagate to future assignments** by
construction: assignment minting reads the effective config through the
plan_license at mint time; existing assignments keep their snapshot
(their own `customer_prices`/`customer_entitlements` rows). Consistent with
grandfathering everywhere else.

**Reconcile (`reconcileLicenseStateForCustomer`) is the janitor, not the
factory** (post init-at-insert): stranded-assignment re-parent/expire,
counter self-heal (`remaining = included − live seats`), lazy pool
materialization for catalog-edit gaps, orphan cleanup.

## Implemented so far (this branch, on top of the descope commit)

### Schema / migrations
- `plan_license.customized` boolean (0044): true iff
  `license_entitlements`/`license_prices` carry the link's item set.
  Maintained solely by `licenseItemRepo.replaceItems`
  (`customized = items.length > 0`) so flag and refs can't disagree.
- `customer_licenses.plan_license_id` (0045): nullable FK → `plan_license`,
  `ON DELETE SET NULL`, indexed.
- NOT YET APPLIED to dev — run `bun db migrate`.

### FullCustomer hydration (CusService.getFull only — not the subject cache)
- `fullCustomer.customer_licenses: FullCustomerLicense[]` (always defined):
  pool rows + effective plan license + effective license FullProduct, one SQL
  round trip (`getFullCustomerLicenses` — lateral join picks override ▸
  catalog; `planLicenseFullProductJson` fragment builds the product json,
  switching on `pl.customized`). Pools with a dead link are currently
  FILTERED OUT (`pl.id IS NOT NULL`) — revisit: with plan_license_id, expose
  them as `license: null` instead.
- `customer_products[n].product.licenses` hydration was built then REMOVED
  (decided against): pools + plan_license_id cover the consumers. Catalog
  links live on `fullProduct.licenses` (ProductService.getFull) only.

### Billing-action foundations (A)
- `initCustomerLicenses` (`billing/v2/utils/initFullCustomerProduct/`): pools
  born with the parent cus product from `fullProduct.licenses`
  (`included > 0`, guarded by `isCustomerProductLicenseParent` — skips
  assignments, entity-scoped, scheduled/expired).
- `FullCusProduct.customer_licenses?: FullCustomerLicense[]` carries them
  (each init'd pool nests its `license: FullPlanLicense`);
  `insertNewCusProducts` inserts them after the cus product rows
  (`insertMany`, `onConflictDoNothing` — conflicts defer to
  upsertGranted/reconcile).
- `LicenseOp.planLicenseId` threaded through the take path
  (`computeLicenseAssignmentPlan` → `executeLicenseTakes` → `upsertGranted`).
- `upsertGranted` accepts + stamps `planLicenseId`; reconcile passes
  `definition.id`.

### Simplifications landed
- `licenseGateRepo.touchesLicenses` → `customerTouchesLicenses({ctx:
  RepoContext, idOrInternalId?, fullCustomer?})`: POOLS-ONLY. In-memory when
  a fullCustomer is provided (top-level pools ∪ init'd cp.customer_licenses),
  else one indexed EXISTS on customer_licenses (customer resolved inline).
  The old 4-branch union is gone: assignments branch (seat ⟹ pool
  invariant), overrides branch (customize corner), and the live-parent-links
  branch (was the lazy-creation trigger — removed deliberately with the
  cusEnts-model decision above). CONSEQUENCE: any catalog-update test that
  links a license AFTER customers attached may need updating — pools no
  longer self-materialize for those customers.
- `reconcileLicenseStateForCustomer({ctx, idOrInternalId?, fullCustomer?})`:
  gate always runs before the full-customer read; `resolveGatedFullCustomer`
  deleted.
- `loadCustomerLicenseState` extracted to its own file; dead `balances`
  pre-load and dead `getLicenseProduct` fetcher removed (2 queries saved).
- `state.parents` → `state.parentCustomerProducts`.
- Shared utils: `isCustomerProductLicenseParent` (classifyCustomerProduct),
  `fullCustomerToLicenseParentCustomerProducts`
  (cusUtils/fullCusUtils/convertFullCustomer/).
- `LICENSE_PARENT_STATUSES` / `LICENSE_ACTIVE_ASSIGNMENT_STATUSES` deleted —
  both were effectively `ACTIVE_STATUSES` (Trialing is not a real cus-product
  status; trials are `trial_ends_at` on Active rows). All license status
  checks now use `ACTIVE_STATUSES`; only `LICENSE_ASSIGNABLE_STATUSES`
  ([Active]) remains.
- Interval-match validation + `validateInPlaceLicenseEdit` deleted (earlier
  working-tree descope); `licenses[].version` re-pins a link
  (`PlanLicenseParams`), TDD contract in
  `license-child-plan-versioning.test.ts`.

## Follow-ups (rough order)

1. Apply migrations (`bun db migrate`), then smoke `getFullCustomerLicenses`
   against a customer with a pool + a customized link.
2. Port billing actions to the new model one by one (John driving):
   verify pools ride attach/upgrade/downgrade/trial-expiry/multiAttach;
   `activateScheduled` needs pools at activation (status update, not insert —
   currently reconcile covers it; consider explicit init).
3. Fix the orphan-pool wart: reconcile's `deleteByParentIdsExcept` keeps
   pools of live parents whose LINK was removed — should delete pools outside
   the offered set (or, with plan_license_id: delete/flag NULL-linked pools).
   Today an orphan keeps the gate true forever → reconcile on every op.
4. Collapse `executeLicenseAssignmentLifecycle` into one `afterLicenseMutation`
   call (pass `internalCustomerId` from a plan product + keep the in-memory
   "did the plan touch any product" guard); dedupe the double gate
   (afterLicenseMutation + reconcile both gate).
5. Descope cuts (agreed, not yet done):
   - CUT 1: customer-level customize (`add_licenses`/`remove_licenses`) — the
     big one (~1.5k lines: resolveLicensePatch, syncCustomLicenseChanges,
     validateCustomLicenseChanges, licenseItemRepo repoint machinery,
     tombstones, gate overrides branch, collector UI,
     license-customize-patch tests + half of license-edge-cases).
     NOTE: also obsoletes the `customized` overlay branch of
     `planLicenseFullProductJson` IF license_prices/license_entitlements go
     with it — but B keeps those tables as the in-place-edit propagation
     mechanism for plan licenses, so likely they stay. Decide.
   - CUT 2: one-off/subscription-less parents (pool_id disambiguation,
     expireOneOff hook).
   - CUT 3: prepaid_only threading (always true; hardcode + prune params).
6. `license_quantities` (the goal): param on attach/update → stored on the
   parent cus product (`license_quantities` jsonb, keyed by public
   license_plan_id) → seat line items priced from the effective license
   product in compute → stripe sub item quantity in evaluate →
   `granted = included + quantity` in initCustomerLicenses + reconcile.
   Guard: never write granted directly; quantity flows through the definition.
7. Dead code sweep: planLicenseRepo (`getCatalogByParentAndLicense`,
   `listCatalogByLicenseInternalProductIds`, `listWithLicensePlanIdByParents`),
   licenseAssignmentRepo (`countActiveByParentAndLicense`,
   `listActiveStrandedByCustomer`), `licenseItemRepo.cloneItems`,
   `PlanLicenseSchema.customize` remnants, duplicate `/license_products`
   route registration, unused `metadata` round-trip on links.
