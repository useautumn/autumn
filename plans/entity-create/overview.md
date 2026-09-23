---
author: john + claude
feature: entity-create
date: 2026-09-23
status: draft, not yet approved
---

# Entity creation as one AutumnBillingPlan

Goal: `entities.create` and `entity_data` auto-create become one action, setup → errors → compute →
execute, whose output is one `AutumnBillingPlan` (+ a `StripeBillingPlan` for paid seats). Then the
plan can go to the balance worker as one atomic `applyBillingPlan`.

Units: `units.md`.

## What exists today

```
entities.create (REST V0, RPC V1)          entity_data (check/track <2.1, get_or_create, attach v0 …)
batchCreateEntities                        autoCreateEntity
 withLock create-entity-request (fail fast) (no request lock)
 validateAndGetInputEntities               feature_id required else 400
 per cusProduct createEntityForCusProduct  per cusProduct createEntityForCusProduct(fromAutoCreate)
   seat lock · usage_limit                   paid seat → 400
   adjustAllowance → Stripe (legacy)
   CusEntService.decrement(N − reps)
   linked cusEnts: ce.entities[id] = allowance | inherit replaceable's key
 claim id-less (update id/name/controls)   claim via EntityService.getNull (dead: `id = null`)
 EntityService.insert                      EntityService.insert (23505 → re-read)
 attachDefaultProductsToEntities           no defaults · billing_controls dropped
   one executeAutumnBillingPlan per entity
   applyPooledBalanceCustomerProductTransitions (cache drop, resets, 3 reloads)
 getApiEntity (legacy) per entity          returns Entity; caller patches the subject
```

Every write is its own autocommit statement: nothing is atomic, and none of it is a plan.

Facts that shape the design:

- **Prod usage** (Axiom, 2026-09-23): allocated seat invoices from entity create are live (one live org,
  5 invoices / 90d, 13 seat increases / 30d; more in sandbox). `entity_data` is used. Id-less creates:
  **0 successful in 30d** (only 400/401s).
- **The billing math already exists as v2.** `balances/utils/allocatedInvoice/` (track's allocated
  invoice) is setup → compute → evaluate → execute: usage from balance (N seats in one call), replaceables
  both directions, proration config, discounts, full sub diff, trial skip, void + 402.
- **It does not write the base seat change.** Track's Lua already deducted; an entity action must add
  `−N` itself, and move linked `ce.entities` keys when it reuses a replaceable.
- **`insertEntities` exists and routes to the worker** (`attachLicense` is its only filler). There is **no
  `updateEntities` facet** (claim, billing_controls) in the plan or the engine's op schema.
- **The worker refuses id-less entities** (`billingPlanNamesItsEntities`): no external id, no subject key.
- **`updates.entities` replaces the whole map.** On the worker that is a set computed at setup time: a
  track on a sibling entity between setup and apply is lost. The engine has `addEntries.entities`
  (per-key increment); nothing emits it yet.
- **Allocated v2 seats never invoice mid-cycle** (`should_prorate: false`); create/delete are pure balance.
- Found on the way:
  - id-less claim decrements the seat a second time (it was decremented when the id-less row was made);
  - `EntityService.getNull` never matches (`id = null`), so auto-create never claims;
  - `autoCreateEntity` drops `billing_controls` and attaches no entity defaults;
  - entity hard delete cascades `internal_entity_id → null`, leaving free entity products customer-level;
  - worker track on a paid allocated feature skips the invoice entirely (rollout flag is hard-coded on).

## Target model

### the unit: a seat change

Creating N entities of feature F and deleting one are the same thing with opposite signs. The unit is a
**seat change** per feature: `{ featureId, added: Entity[], removed: Entity[] }`. It expands into, per
cusProduct holding F:

```
seat cusEnt      balanceChange −N (+ reps reused)          increment: commutes with tracks
                 deleted/inserted replaceables
linked cusEnts   ce.entities: add key (allowance)          per-key increment
                 or move a replaceable's key to the entity
paid seat        allocatedInvoice compute → line items + sub quantity   (StripeBillingPlan)
```

Create uses `added`; delete (later) uses `removed`. One compute, both directions, the way
`computeUpdateCustomerEntitlementPlan` already is.

### the action

```
internal/entities/actions/createEntities/
├── createEntities.ts                 orchestrator
├── types.ts                          CreateEntitiesContext · CreateEntitiesOptions
├── setup/
│   ├── setupCreateEntitiesContext.ts fullCustomer · requested → { inserted, claimed } · defaults
│   └── setupSeatBillingContext.ts    Stripe context, only when a paid seat changes
├── errors/handleCreateEntitiesErrors.ts  consumable · >1 id-less · duplicate · usage_limit · paid seat refused
├── compute/
│   ├── computeCreateEntitiesPlan.ts  entity rows + seat changes + defaults → one AutumnBillingPlan
│   ├── computeEntityRows.ts          insertEntities · updateEntities (claim)
│   └── computeEntityDefaults.ts      insertCustomerProducts per entity + pooledBalancePlan
└── logs/logCreateEntities.ts

internal/entities/actions/common/seatChange/
└── computeSeatChangePlan.ts          the unit above; calls allocatedInvoice compute for paid seats
```

```ts
createEntities({ ctx, customerId, customerData, entities, options })
  context = await setupCreateEntitiesContext(...)
  handleCreateEntitiesErrors({ context, options })
  plan    = computeCreateEntitiesPlan({ ctx, context })
  await executeBillingPlan({ ctx, billingContext, billingPlan: plan })   // Stripe first if any, then Autumn
  return context.entities
```

`options` is the only difference between the two callers:

| | `entities.create` | `entity_data` |
|---|---|---|
| `allowPaidSeats` | true | false (400, as today) |
| request lock | yes | no |
| defaults, `billing_controls` | yes | **decision 2** |

### execute order and atomicity

```
Stripe   sub quantity + proration invoice (paid seats only)   unpaid → void, 402, nothing else written
Autumn   one AutumnBillingPlan                                 Postgres: one transaction
                                                               worker: one applyBillingPlan
```

Stripe first matches attach and today's entity path (the declined-card test asserts nothing is written).
Stripe done + Autumn failed is attach's existing hole, not a new one.

### on the worker (later unit)

- Plans with named entities route as-is (`insertEntities` + increments).
- Map writes become `addEntries.entities` increments, not a whole-map set.
- An entity insert whose entity exists replies `entity_exists` (today it's `STALE_SUBJECT`).
- Id-less inserts and claims stay on the Postgres lane (no subject key; the same rule as id-less customers).
- `withCreateIfMissing` learns `ENTITY_NOT_FOUND` + `entity_data` → `createEntities` → re-run.

## Decisions

| # | question | recommendation |
|---|---|---|
| 1 | Does a claim (id-less → id) use a seat? | **No.** The id-less row already took one; a claim is `updateEntities` (id, name, controls) + a linked key seed. Fixes the double decrement. |
| 2 | Should `entity_data` attach entity defaults and write `billing_controls`? | **Yes.** Same action; only paid seats differ. Behavior change for `entity_data` callers on orgs with `default_applies_to_entities`. |
| 3 | Folder | `internal/entities/actions/createEntities/`, mirroring `customers/actions/createWithDefaults/` (a domain action that emits a billing plan). The seat change sits in `entities/actions/common/` so delete reuses it. |
| 4 | No Stripe subscription on a paid seat | Autumn only, no invoice (legacy behavior). v2 compute throws today, so guard in setup. |
| 5 | Replaceables during a trial | Keep v2 semantics (created) unless a test says otherwise; legacy skipped them. |
| 6 | Pooled contributions of entity defaults | In-plan `computePooledBalanceTransitionPlan`, as `attachLicense` does. Drops today's reset-before-transition; on the worker, resets are lazy anyway. |
| 7 | Response | Keep `getApiEntity` (legacy shape) from the post-plan customer in the refactor; the switch to `entities.get`'s builder is its own change. |
| 8 | Delete | Out of scope now. It becomes `removed` on the same seat change, a later unit. |
