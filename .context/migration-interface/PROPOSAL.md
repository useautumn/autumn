# Proposal: Operation Plan + Pluggable Planners

## Mental model

> **Planning produces a typed `OperationPlan`. Execution consumes it.**
> Migrations and imports differ in how they *produce* the plan; everything downstream — guards, dry-run, persistence, execution, reconciliation — is shared.

This is a strict departure from "build one big billing action." The migration interface is not a single action — it is a **planner / executor pair**, where the plan is a durable, inspectable artifact and execution is a typed reducer over operations.

The reason: scripts today informally do exactly this lifecycle (scope → load → resolve → prepare → plan → guard → execute → verify), but the contracts between stages are bespoke. The win is canonizing the stage contracts, not unifying the verbs.

---

## Why planner + executors (vs. single billing action)

1. **Operations are heterogeneous.** Catalog mutations, customer-product graph changes, balance syncs, Stripe repair, cache invalidation — each has different idempotency, different transaction boundaries, different blast radius. One "migrate" action that handles all of them gets a sprawling `compute*Plan` function. Separate executors keep each surface clean.
2. **Plans are first-class artifacts.** Persistable. Diffable. Re-runnable. Approval-able. Eventually user-facing on the dashboard ("preview migration → approve → apply").
3. **Dry-run = real plan.** Same code path produces the plan; only `apply()` differs. No drift.
4. **Imports vs migrations diverge cleanly.** They're different *planners* emitting the same operation graph. Shared execution; specialized planning.
5. **Concrete reuse path.** `CustomerProductGraphOperation.replace` executor wraps the existing 5-stage billing v2 pipeline. We're not replacing billing v2 — we're putting an orchestration layer above it.

---

## Architecture

### Module placement

```
autumn/server/src/internal/operations/
  types/
    operation.ts                    -- Operation discriminated union
    operationPlan.ts                -- OperationPlan, CustomerOperationPlan, RunContext
    operationResult.ts              -- OperationResult, GuardResult, MigrationDiff
    productItemPatch.ts             -- ProductItemPatch union (PATCH-style customize)
  executors/
    catalog/                        -- CatalogOperation executor
    customerProductGraph/           -- CustomerProductGraphOperation executor (wraps billing v2)
    customerEntitlement/            -- CustomerEntitlementOperation executor
    balance/                        -- BalanceOperation executor
    stripeRepair/                   -- StripeRepairOperation executor
    cache/                          -- CacheInvalidationOperation executor
  planners/
    migration/                      -- MigrationDefinition runner
    import/                         -- ImportDefinition runner
  guards/                           -- composable, named guard sets
  reporting/                        -- diff, audit, CSV export
  persistence/                      -- migration_runs / migration_plans schema + service
  execute.ts                        -- top-level executePlan(plan, { dryRun })
```

This sits **as a peer** to `billing/v2/`, not under it. `billing/v2/` is the substrate; `operations/` is the orchestration layer.

### Type model

```ts
// The durable artifact
type OperationPlan = {
  run: RunContext;                   // org_id, env, dry_run, source description, created_at
  catalog: Operation[];              // run-level (executes once, before per-customer)
  customers: CustomerOperationPlan[];// per-customer
  warnings: GuardResult[];           // non-blocking
  blockers: GuardResult[];           // execution refuses if any blockers
};

type CustomerOperationPlan = {
  customer_id: string;
  // Operations declared in execution order. Within a customer, ops execute serially.
  // Operations targeting the same Stripe subscription are batched by the executor
  // into a single subscriptions.update — this is the existing multi-update atomicity
  // boundary.
  operations: Operation[];
  guards: GuardResult[];
  preview: CustomerPreview;          // human-readable diff of intended changes
};

type Operation =
  | CatalogOperation
  | CustomerProductGraphOperation
  | CustomerEntitlementOperation
  | BalanceOperation
  | StripeRepairOperation
  | CacheInvalidationOperation;

// Mutation surface 1: catalog
type CatalogOperation =
  | { type: "ensure_feature"; spec: FeatureSpec }
  | { type: "ensure_plan_item"; product_selector: ProductSelector; item: ProductItemSpec }
  | { type: "ensure_shared_price"; signature: string; spec: PriceSpec }
  | { type: "ensure_shared_entitlement"; signature: string; spec: EntitlementSpec }
  | { type: "link_stripe_resource"; price_id: string; stripe_price_id?: string; stripe_product_id?: string }
  | { type: "swap_archived_stripe_price"; price_id: string };

// Mutation surface 2: customer product graph (the big one)
type CustomerProductGraphOperation =
  | { type: "attach"; assignment: TargetAssignment; ownership: Ownership }
  | { type: "replace"; subscription_id?: string;
      from: CusProductSelector[];                      // expire these
      to: TargetAssignment[];                          // insert these
      carry?: { balance: boolean; subscription_ids: boolean; anchors: boolean } }
  | { type: "expire"; targets: CusProductSelector[]; reason: string }
  | { type: "schedule"; phases: ScheduledPhase[] };

// Mutation surface 3: customer entitlement (B-layer in old proposal)
type CustomerEntitlementOperation =
  | { type: "backfill_for_customers"; product_selector; feature_id; require_price?: boolean }
  | { type: "patch_flag"; selector; flags: Partial<Pick<Entitlement, "usage_allowed" | "carry_from_previous">> }
  | { type: "clamp_balance"; selector; ceiling: number };

// Mutation surface 4: balance (imports especially)
type BalanceOperation =
  | { type: "seed_balance"; balance_id: string; cus_ent_selector; amount: number; entity_id?: string }
  | { type: "set_balance"; cus_ent_id: string; balance: number }
  | { type: "delete_stale_balance"; cus_ent_id: string; reason: string };

// Mutation surface 5: stripe repair (imports especially)
type StripeRepairOperation =
  | { type: "link_subscription"; cus_product_id: string; stripe_subscription_id: string }
  | { type: "expire_orphaned_imported_cus_product"; cus_product_id: string };

type CacheInvalidationOperation =
  | { type: "invalidate_customer_cache"; customer_ids: string[] }
  | { type: "invalidate_products_cache" };
```

### TargetAssignment + ProductItemPatch

The two key composite types.

```ts
type TargetAssignment = {
  product: { id: string; version?: number };
  entity_id?: string | null;
  subscription_id?: string | null;       // for imports linking to existing Stripe sub
  feature_quantities?: FeatureQuantity[];
  item_patches?: ProductItemPatch[];     // PATCH-style customize
  billing_dates?: { trial_ends_at?: number; reset_cycle_anchor?: number; billing_cycle_anchor?: number };
  ownership?: Ownership;                 // imported / user-created / migrated
};

// PATCH-style. Compiles into FullProduct + customPrices + customEnts
// that existing billing v2 compute already understands.
type ProductItemPatch =
  | { op: "add_existing"; entitlement_id: string; price_id?: string }   // reference shared catalog rows
  | { op: "replace_feature"; feature_id: string; entitlement_id: string; price_id?: string }
  | { op: "remove_feature"; feature_id: string }
  | { op: "override_allowance"; feature_id: string; allowance: number; unlimited?: boolean }
  | { op: "override_price"; feature_id?: string; price: PricePatch }    // mints a custom Price row
  | { op: "set_options"; feature_id: string; options: { quantity?: number } };

type Ownership = {
  origin: "imported" | "user_created" | "migrated";
  source?: string;                       // e.g. "stripe_subscription:sub_abc"
  imported_at?: number;
};
```

`add_existing` is the load-bearing fix: it lets a 10k-customer migration reference one shared catalog row instead of minting 10k custom rows. **`is_custom` becomes an ownership flag (one-off vs catalog) decoupled from "uses custom prepared rows."**

### Execution model

```ts
// Top-level entry point
async function executePlan(plan: OperationPlan, opts: { dryRun: boolean }): Promise<PlanResult>

// Strict execution rules:
// 1. If plan.blockers is non-empty AND !dryRun → throw, refuse.
// 2. Catalog ops execute first, in declared order, before any customer ops.
// 3. Customer plans execute in parallel (configurable concurrency); same-customer
//    operations execute serially in declared order.
// 4. Within one customer, operations targeting the same Stripe subscription are
//    GROUPED by the CustomerProductGraphOperation executor and emitted as ONE
//    subscriptions.update via the existing evaluateStripeBillingPlan + executeBillingPlan
//    path. This preserves multi-update atomicity.
// 5. Each operation returns OperationResult { status, diff?, error?, artifacts? }.
// 6. Dry-run produces the same operations list; executors emit `would_apply` results
//    with diffs but mutate nothing.
```

**The CustomerProductGraphOperation executor for `replace` is essentially today's `multi-update/`** generalized: build the per-product context list, call `computeCustomPlanNewCustomerProduct` per item, aggregate into `AutumnBillingPlan`, run through `evaluateStripeBillingPlan` + `executeBillingPlan`. Everything downstream of the Operation type is reused.

### Persistence

Plans persist to DB for non-trivial runs. Schema:

```
migration_runs       -- one per orchestrated run (org, env, source, status)
migration_plans      -- the OperationPlan JSON, snapshot at planning time
migration_ops        -- one row per operation, with status + diff + result
migration_artifacts  -- CSV exports, snapshots, audit rows
```

Trivial cases (single-customer one-off) can skip persistence and go straight through `executePlan`. Bulk runs persist.

States: `draft → planned → applying → completed | failed | partial`. A `partial` failed run is resumable: the executor skips ops with `status: applied` and re-runs `pending` / `failed` ops.

### Planners

```ts
type MigrationDefinition = {
  id: string;
  selectCandidates(ctx): Promise<CustomerScope[]>;
  buildTargetState(ctx, customer): Promise<TargetState>;
  plan(ctx, target): OperationPlan["customers"][number];
};

type ImportDefinition = {
  id: string;
  loadExternalSource(ctx): Promise<SourceSnapshot>;
  resolveIdentities(ctx, source): Promise<IdentityMap>;
  mapTargets(ctx, source, identities): Promise<TargetState[]>;
  plan(ctx, target): OperationPlan["customers"][number];
};
```

Mintlify import becomes `ImportDefinition`. Mintlify migrate-credits becomes `MigrationDefinition`. Both emit the same `OperationPlan` shape.

---

## Phased build order

### v0 — Migration Core (3-4 weeks)
**Concrete deliverable: port mintlify migrate-credits' multi-update path to use this system.** That single port validates 80% of the abstraction.

1. `Operation` type + `ProductItemPatch` compiler (`patches → FullProduct + customPrices + customEnts`).
2. `CustomerProductGraphOperation.replace` executor wrapping the existing multi-update pipeline.
3. `OperationResult` + `CustomerPreview` shapes (Autumn diff + Stripe sub-update preview).
4. Guard set: `subscription-replace` (mismatched-sub-in-group, missing payment, anchor drift, collection_method preservation).
5. `executePlan` for in-memory plans (no DB persistence yet).
6. Integration tests: port the mintlify migrate-credits scenarios.
7. Migration runner harness for scripts-v2 (one-line: `runPlan(planner, opts)`).

### v0.5 — Catalog Prep (1-2 weeks)
8. `CatalogOperation` executor: `ensure_feature`, `ensure_plan_item`, `ensure_shared_price`, `ensure_shared_entitlement`, `link_stripe_resource`.
9. Run-level catalog ops execute before per-customer ops.
10. Port `retroactively-add-plan-item-to-versions` + `retroactively-add-plan-item-to-customers` to the new system (validates catalog → customer-entitlement composition).

### v0.75 — Persistence + Resume (1 week)
11. `migration_runs` / `migration_plans` / `migration_ops` schema.
12. `executePlan` writes operation results; partial-failure resume.
13. Read-only view of past runs (no UI yet, just service methods).

### v1 — Auxiliary surfaces (2 weeks)
14. `BalanceOperation` executor (Mintlify period_usage, Firecrawl coupon balances).
15. `CustomerEntitlementOperation` executor (flag-flips, balance clamps, backfills).
16. `StripeRepairOperation` executor.
17. Port one full Firecrawl import slice as a smoke test.

### v1.5 — Imports as planner (2-3 weeks)
18. `ImportDefinition` runner with identity resolution + source normalization stages.
19. Port mintlify-import to use this. Firecrawl-import follows.

### v2 (deferred) — Dashboard + API
20. Dashboard view: list runs, inspect plan, dry-run preview, approve & apply.
21. Public API for self-serve migrations.

---

## Synthesis: what changed from v1 of this proposal

| v1 (PROPOSAL.md before) | v2 (now) | Why |
|---|---|---|
| Single `migrate` action with `PlanOp` discriminated union | Planner + executors with typed operations by mutation surface | Heterogeneous mutation surfaces don't belong in one action |
| 3 layers (catalog / backfill / transition) | Flat operation graph with execution ordering rules | Layers were artificial; ops at the same level with declarative dependencies is cleaner |
| `use_shared_rows` flag bolt-on | `ProductItemPatch.add_existing { entitlement_id, price_id }` first-class | Semantics are clearer when they're a discrete patch op |
| `is_custom` overloaded for "one-off" + "uses custom rows" | Decouple: `is_custom` = ownership flag; shared rows = first-class catalog rows | Resolves a long-standing concept conflation |
| Imports = migration + 5 extensions | Imports = different planner emitting same operation graph | Cleaner separation of concerns; identity/source/mapping is genuinely different from migration |
| Action-level `preview` flag | First-class plan artifact; dry-run = identical plan path | Plan becomes inspectable, persistable, approvable |
| No persistence story | `migration_runs/_plans/_ops` schema; resumable partial runs | User asked for "core feature, not internal tool" — first-class needs persistence |
| No ownership concept | `Ownership` first-class on every TargetAssignment | Repair logic is currently bespoke per-script because we can't tell imported from user-created |

---

## Open design questions (the load-bearing ones)

1. **Plan persistence: opt-in or default-on?**
   Lean: **default-on for `bulk` planners (>1 customer); opt-out for one-shot operations.** Persistence enables resume, audit, dashboard surfacing — worth the schema cost.

2. **Operation ordering within a customer plan: declared or topologically derived?**
   Lean: **declared.** Planners produce ops in execution order. Simpler, and the planner already knows what depends on what (e.g. `attach` before `seed_balance`). No DAG solver needed.

3. **Subscription-group atomicity: explicit or implicit?**
   Lean: **implicit, in the executor.** The executor groups operations by Stripe sub before executing. This keeps the operation list flat and forgiving — caller doesn't have to think about Stripe's batching boundary, the executor handles it.

4. **Ownership flag: stored where?**
   Options: (a) new column on `customer_products`, (b) jsonb metadata, (c) separate `customer_product_ownership` table.
   Lean: **new column** — it's load-bearing for repair queries; jsonb is too soft.

5. **Existing `billingActions.migrate`: keep, deprecate, or absorb?**
   Need to read it. If it's a thin version-bump helper, keep as a shorthand that produces a one-op plan. If it's heavier, deprecate in favor of `MigrationDefinition`.

6. **Where does identity resolution live for imports?**
   In the `ImportDefinition.resolveIdentities` stage. The output is an `IdentityMap` that subsequent stages consume. Don't bake identity logic into Operations — keep operations identity-agnostic (they take `customer_id`, not "find or create customer with this email").

7. **Public-facing types: when?**
   Defer until v2 (dashboard). Internal types can move freely; public types lock when we expose this to users. Avoid premature stability commitments.

8. **`is_custom` decoupling: backwards compat?**
   Existing custom rows have `is_custom: true`. New "shared catalog rows referenced by patch" don't set this flag. We need a cleanup or co-existence story for current per-customer custom rows. Lean: leave existing rows alone; new code uses the new model; eventually a `null is_custom` migration cleans up.

---

## Open question deferred from v1

- **PATCH vs PUT customize:** resolved by `ProductItemPatch` discriminated union (PATCH-style, with `add_existing` for shared rows).
- **Custom prices: per-customer rows vs reused per-plan rows:** resolved by `add_existing` / `ensure_shared_*` catalog ops.
- **Preparation step placement:** resolved — it's `CatalogOperation` ops inside the same plan.
