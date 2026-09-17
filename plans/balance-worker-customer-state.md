# Balance worker: customer state as rows, outcomes as one mutation

2026-09-16 · og/balance-worker-observability · 9a728fcbb7

Cleanup of the business-logic layers before the stack merges for prod shadowing.
Two changes, one idea: the worker is a **mutation stream over the customer's rows**.

1. `CustomerMeteringState` becomes the customer-owned rows of `NormalizedFullSubject`, catalog kept apart.
2. `TrackOutcome | StateInitializedEvent` becomes one `SubjectStateMutation` whose `changes` are row-ops, the way `AutumnBillingPlan` is one object every billing action fills in.

Everything downstream (SQLite apply, receipts, checkpoint, follower, shadow) stops branching on record type.

## Context

### the state today
[packages/balance-engine/src/contracts.ts · apps/balance-worker/src/state/]

- customer on pro (api_calls 1000/mo), initialize then track 5
  - what does `featureStatesById.api_calls.customerEntitlements[0]` hold vs the real `customer_entitlements` row?   → fullSubjectToMeteringState
  - which of `granted / planId / reset / usage` are derived from catalog, and where does that derivation run?     → getApiBalance
- same customer gets `balances.create` for a second feature
  - which record type would the log need? which store method? which writer branch?                                → applyDurableStateInitialization vs applyDurableTrackOutcome
- checkpoint written, worker restarts
  - which fields does `partitionCheckpoint.ts` parse and hash? what happens if a field is renamed?                 → contentHashOf, ENGINE_SCHEMA_VERSION

related: `customer_states.initialization_id` and `track_receipts` are two dedup mechanisms for one question, "have I seen this command id with this fingerprint".

### the precedent
[shared/models/billingModels/plan/autumnBillingPlan.ts · server/src/internal/billing/v2/execute/executeAutumnBillingPlan.ts]

- attach, updateSubscription, cancel, checkout webhook
  - what do they all return? which executor consumes it, in what order?                                            → AutumnBillingPlan, executeAutumnBillingPlan
  - how does `UpdateCustomerEntitlementSchema` express "which row, what changed"?                                   → customerEntitlement + updates
- `NormalizedFullSubject` vs `FullSubject`
  - which fields are customer rows, which are catalog, which are entity aggregates?                                 → normalizedFullSubjectModel.ts:161
  - how does the DB query hand back catalog once for many subjects?                                                 → SubjectQueryEnvelope

related: the Redis cache already stores the normalized (flat, row-shaped) form; `normalizedToFullSubject` is the only bridge to the nested API view.

### what a track really mutates
[server/src/_luaScriptsV2/fullSubjectDeduction/ · shared/utils/cusEntUtils/sortCusEntsForDeduction.ts]

- track 5 against api_calls with a rollover and an entity balance
  - which columns change: `balance`, `adjustment`, `entities`, `usage_attribution`, `rollovers.*`? which never do?   → runDeductionOnContextV2.lua, syncBalancesV2.sql
  - what orders the cusEnts before deduction?                                                                        → sortCusEntsForDeduction
- the same track through the worker today
  - which of those are representable in `BalanceMutation`?                                                           → computeDeduction

related: the worker's supported surface stays "one direct metered cusEnt, no entity" for this cleanup. The row model must leave room for the rest without a new mechanism.

## Target model

### State: the customer's rows, catalog beside it

```
┌─ SubjectState (one per customer, revisioned) ──────────────────┐
│ identity { orgId, env, customerId }        revision: 7          │
│                                                                 │
│ customer            ┌──────────┐   billing controls only        │
│ customerProducts    │ by id    │   status, options, entity      │
│ customerEntitlements│ by id    │   balance, adjustment, entities│
│ rollovers           │ by id    │   balance, usage, expires_at   │
│ usageWindows        │ by id    │   (empty until supported)      │
│ entities            │ by id    │   id, internal_id, feature_id  │
└─────────────────────────────────────────────────────────────────┘
          │ references by id, never embeds
          ▼
┌─ Catalog (org-level, not revisioned, not in the log) ───────────┐
│ products · entitlements (with feature) · prices · free_trials   │
└─────────────────────────────────────────────────────────────────┘
```

Rows are **picks of the shared schemas**: each table's engine schema is `.pick()` of the `@autumn/shared` zod row schema with Postgres column names and only the columns check/track read, `.strict()`. The engine imports `@autumn/shared`; shared helpers are adopted one at a time, each narrowed to a `Pick<…>` of the fields it reads. `NormalizedFullSubject` → `SubjectState` is a pick, not a derivation. Catalog rows are never in state: state references them by id and the worker resolves the ids through the tiers below.

### Entities: one stored state per subject, not per customer

A customer can have 100k entities, so the customer's rows are never one JSON value. SQLite keeps one table, `subject_states`, with one row per **subject**: the customer-level rows under `cus_abc`, each entity's rows under `cus_abc:ent_42`. That is the same customer/entity split the Redis cache makes with its subject keys.

```
subject_states (partition_key, subject_key, state_json)

subject_key        state_json
cus_abc            { revision: 7, customer, customerProducts{}, customerEntitlements{}, rollovers{} }   customer-level rows
cus_abc:ent_42     { entity, customerProducts{}, customerEntitlements{}, rollovers{} }                  ent_42's rows only

track api_calls 5, cus_abc, entity ent_42
  GET cus_abc          → customer-level rows (~tens)
  GET cus_abc:ent_42   → this entity's rows
  view                 = both, filtered to api_calls in memory
  computeTrack         → changes: update { ce_ent42: balance 10 → 5 }
  apply                → patch the subject state that owns ce_ent42; revision 7 → 8 on cus_abc
```

The engine computes over a `WorkerFullSubject` built from one `SubjectState`: for an entity command, the customer's stored state merged with the entity's own. Each stored state has `entity` null for the customer and the entity row otherwise; a row's `internal_entity_id` says which subject owns it, and the split/merge helpers move rows accordingly. Revision lives on the customer's state so the customer's mutations stay totally ordered; an entity initialize joins the log at the customer's current revision. The customer-view aggregate across entities is out of scope until entity tracks are supported; Redis's `_aggregated` is likely deprecated, so the worker should not mirror it. The legacy `entities` jsonb map on one cusEnt stays an opaque field, same as the Redis hash field today.

### Catalog: the rows a customer's state points at, cached in worker memory

```
customer_entitlements.entitlement_id       ──►  entitlements:ent_123
customer_products.internal_product_id      ──►  products:prod_internal
customer_entitlements.internal_feature_id  ──►  features:fi_internal
```

The catalog a command needs is *whatever this customer's rows reference*, fetched by id.
There is no org-level catalog object: custom entitlements (3.34M of 3.44M entitlement rows
in prod, 98% referenced by exactly one `customer_entitlements` row) are just more ids. Rows are
the shared `Entitlement` / `Product` / `Feature` types, not picks: they are cached, never
stored in state, the log or a checkpoint.

One tier in front of Postgres. A balance-worker task is one Bun process and every partition it
owns runs on its main thread, so one in-process cache is already shared by everything that
could share it; a fleet-shared tier (SQLite on EFS is unsafe, Dynamo is a network hop) buys
nothing the hot path wants.

```
┌─ worker memory: lru-cache<"table:id", row> ──┐   ┌─ CatalogRowsSource ─────────┐   ┌─ Postgres ─────┐
│ ~1 µs, sync, read inside decide              │──►│ external/catalog/, Postgres  │──►│ source of truth│
│ maxSize bytes, size = JSON length            │   │ by primary key, per table    │   │                │
│ products/features: ttl 5 min (backstop)      │   └─────────────────────────────┘   └────────────────┘
│ entitlements: LRU only                       │
└──────────────────────────────────────────────┘
```

`decide` reads the cache synchronously and reports what is missing; only a miss touches the
network, and the miss is detected against the freshest state so a row inserted by an in-flight
mutation is never raced:

```
decideWithCatalog
  decide ──► mutate: keys = subjectStateToCatalogKeys(state); catalog = cache.read(keys)
             missing = filterCatalogKeysMissingFrom(keys, catalog)
             missing → reply { kind: "needsCatalog", keys }          nothing written, no revision consumed
  await cache.load({ identity, keys })                               coalesced per key → source → put
  decide ──► rows present → compute → write
             still missing → CatalogRowsNotFoundError
```

**Invalidation is pushed, org-scoped.** The server already tails the ownership topic and holds
every owner's endpoint; the client already posts to workers. A catalog write (products
middleware, `clearOrgCache`) calls `notifyBalanceWorkersOfCatalogChange({ orgId, env })`, which
posts `/v1/catalog/invalidate` to every distinct owner endpoint, best effort, behind the rollout
flag. The worker drops that org's products, features and **base** entitlements. Custom
entitlements (`is_custom`) stay: they belong to one customer and are minted, never edited. The
mutable-row ttl is the backstop for a worker that missed the signal.

**Structural commands carry their rows.** `initialize` (later attach, `balances.create`) comes
from the server, which already holds the catalog rows it just used; the wire carries
`catalogRows: CatalogRow[]` and the worker `put`s them before `decide`. Only check and track
ever take the miss path. Followers apply `before → after` and need no catalog. Compute never
knows a cache exists: `computeTrack({ state, catalog, command })`.

Numbers (prod, 2026-09-16): base entitlements p50 8 / p99 453 per org, 52.5k total;
products p99 63, max 234 per org; the largest product has 4.5M active `customer_products`,
the fan-out a per-row cache never pays.

### Mutation: one record, an ordered list of row changes

```
┌─ SubjectStateMutation (the Kafka record, the receipt) ────────────────┐
│ id · identity                          index keys the store looks up by │
│ revision: { before: 7, after: 8 }      ordering guard                   │
│ command: { kind: "track", requestId, occurredAt, featureId, value, … }  │
│                                        request echo, no bulk payload    │
│ changes: [                             applied in order                 │
│   { table: "customerEntitlements", op: "update", id: "ce_1",            │
│     before: { balance: 100 }, after: { balance: 95 } } ]                │
│ result: { kind: "track", status: "applied", appliedValue: 5, … }        │
│ receipt: { fingerprint, expiresAt }    exactly what mutation_receipts   │
│                                        stores                           │
└─────────────────────────────────────────────────────────────────────────┘
```

```ts
type TableRowChange<Table, Row> =
  | { table: Table; op: "insert"; row: Row }
  | { table: Table; op: "update"; id: string; before: Partial<Row>; after: Partial<Row> }
  | { table: Table; op: "delete"; id: string };

type RowChange =
  | TableRowChange<"customerProducts",     CustomerProductRow>
  | TableRowChange<"customerEntitlements", CustomerEntitlementRow>
  | TableRowChange<"rollovers",            RolloverRow>
  | TableRowChange<"entities",             EntityRow>;
```

```
command                              changes
initialize                     ──►   insert every row, in order
track 5, balance 100           ──►   [ update customerEntitlements ce_1 { balance: 100 → 95 } ]
track 5, reject, balance 3     ──►   [ ]   (result.status = "rejected")
balances.create (future)       ──►   [ insert customerEntitlements ]
attach (future)                ──►   [ insert customerProducts, insert customerEntitlements, … ]
```

`before` on an update is the stale guard `applyDeduction` does by hand today. `applyChanges` is a `for` over the list with a `switch` on `op`; it never knows what a track is. One writer per partition applies in order, so before → after replaces every delta the billing plan needs for racing writers. Flexibility lives in `command` (any input shape) and `result` (any reply shape), never in a new change op.

### Flow after the change

```
server                    engine (pure)                      worker
─────────                 ─────────────                      ──────
params → command  ──────────────────────────────────────►    catalog tier: SQLite hit, or Dynamo → Postgres on miss
                          computeTrack({state,catalog,command})
                           → { kind:"new", mutation }
                                                             writer.decide: dedup by (mutationId, fingerprint)
                                                             applyChanges(projected) · append · store.apply
row ◄─────────────────────────────────────────────────────── decision { mutation, result.customerEntitlement }
row + FullSubject → ApiBalance via getApiBalance
```

## Plan

Order: prove the mutation stream (done), swap the row vocabulary under it and make the
server speak rows, then give the worker its catalog tier with the rows initialize already
carries, and only then add the remote tiers. Each unit is green on its own; no unit leaves
worker or server red for the next.

### 0 · [x] worker → `state/` as repos, actions, facade (pure move)

`john/state-structure` 7fecc92414.

### 1 · [x] data model → one `SubjectStateMutation` record, end to end

`john/one-record` 22bea8d23f. Every suite green: engine 29 · kafka 96 · client 22 · worker 435 · server balance suites 209.

### 2 · [x] engine → catalog vocabulary, utils in the shared-utils shape

**goal** — the engine says what a catalog row is, which rows a state references, and what a catalog lacks; nothing else about caching
**steps** — `models/catalog/{catalogKey,catalogRow,catalog}.ts` over shared `Entitlement`/`Product`/`Feature`; delete the `worker{Entitlement,Product,Feature}` picks · `utils/catalogUtils/{convertCatalogUtils,filterCatalogUtils,findCatalogUtils}.ts`: `subjectStateToCatalogKeys`, `catalogRowToCatalogKey`, `catalogKeyToString`, `catalogRowsToCatalog`, `filterCatalogKeysMissingFrom`, `findFeatureById` · initialize wire carries `catalogRows: CatalogRow[]` · `parseCatalog`, `parseCatalogRow`
**verify** — `tests/unit/utils/catalogUtils/catalogUtils.test.ts`; engine `src/` typechecks

### 3 · [x] worker → `catalog/` cache, fake source

```
apps/balance-worker/src/catalog/
├── createCatalogCache.ts        read · load · put · invalidate
├── actions/{readCatalog,loadCatalogRows,putCatalogRows,invalidateCatalog}.ts
├── catalogErrors.ts             CatalogRowsNotFoundError
└── types/{catalogCache,catalogRowsSource,catalogCacheContext}.ts
```

**steps** — `lru-cache` with `maxSize` + `sizeCalculation`, per-entry `ttl` for products/features · in-flight `Map` so concurrent misses share one source call · invalidate drops products, features and non-custom entitlements of one org (products/features also by env)
**verify** — unit tests with a fake source: hit · miss then load · coalesced load · ttl by table · size bound · invalidate keeps custom entitlements · not found

### 4 · [x] worker + server → wired end to end, tree green

**steps** — `processor/common/catalogForState.ts` (`readCatalogForState`, `decideWithCatalog`) · track/check use it; initialize `put`s `command.catalogRows` · `catalogCache` on `PartitionProcessorDependencies`, built in `openWorkerResources`, threaded through the runtime factory · `http/handlers/receiveInvalidateCatalog.ts` · server `fullSubjectToSubjectState` becomes a pick plus `fullSubjectToCatalogRows`; `balanceWorkerTrackResponse` overlays `result.customerEntitlement.balance` onto the server's `FullCustomerEntitlement` and calls `getApiBalance`; delete `meteringBalanceToApiBalance` · fix `tests/fixtures/mutations.ts` and every suite
**verify** — worker `bun ts` · engine, kafka, client, worker, server balance suites

### 5 · [x] postgres → per-table repos, worker sources

**steps** — `packages/postgres/src/catalog/repos/{entitlements,products,features}.ts`: `getEntitlementsByIds`, `getProductsByInternalIds`, `getFeaturesByInternalIds`, scoped by org (and env where the table has one), zod at the boundary · worker `external/catalog/{getPostgresClient,createPostgresCatalogRowsSource}.ts` · `BALANCE_WORKER_DATABASE_URL`
**verify** — package unit tests against local Postgres · worker integration: uninitialized-catalog track → one Postgres read · EXPLAIN on staging

### 6 · [x] engine + worker → one stored state per subject, entity subjects

**goal** — a subject is a customer or one of its entities; each is its own SQLite row under its subject key, the customer's revision orders them all, and commands compute over the customer's state merged with the named entity's own
**steps** — `SubjectState` (renamed from CustomerState) carries `customer: WorkerCustomer` (internal_id, id, config) and `entity: WorkerEntity | null` instead of an entities table; the initialize echo carries both so a replay rebuilds the row; `splitSubjectState` / `mergeSubjectStates` split and assemble · `subject_states(subject_key PK, partition_key, …)`; `readStoredState`, `readStoredStates`, `readOwnState` on the store; `applyRecord` writes the customer's state under its revision guard and the entity's own state beside it · writer projects pending state per subject (`projectedStateBySubjectKey`) so interleaved customer and entity mutations see each other's revision · entity initialize: `computeInitialize({ revisionBefore })`, echo carries the entity, `applyMutation` admits an entity initialize onto existing state; `initializeSubject` decides inside the critical section · hydration keyed by subject key: customer first, then the entity if the view lacks it; `getSubjectRows({ entityId })` returns one subject's own rows and its `entity`, no catalog rows · `ENTITY_NOT_FOUND` 404 · server keeps refusing `entity_id` at the request gate until the worker path is exercised end to end
**verify** — engine 46 · worker `subject-views`, `entity-subjects`, `ensure-subject-state` · postgres SQL param tests · every suite green

### 12 · [ ] broadcast → server signal reaches every worker (last)

**steps** — kafka `OwnershipConsumer.listOwners()` · client `invalidateCatalog({ orgId, env })` via `routing/sendToAllOwners.ts` · server `notifyBalanceWorkersOfCatalogChange` called from `clearOrgCache` and `refreshProductsCacheMiddleware`, fire-and-forget, logged
**verify** — integration: edit a product, next track on a worker serves the new row

### 7 · [x] engine → helper rename pass

`*Of` helpers take the shared-utils shape: `meteringIdentityToPartitionKey` and `meteringIdentityToSubjectKey` in `identityUtils/convertIdentityUtils.ts`, `isSameCustomerIdentity` in `identityUtils/classifyIdentityUtils.ts`, `mutationToFingerprint`, `trackCommandToFingerprint`, `initializeCommandToFingerprint`, `trackCommandToShadowComparisonKey`. `balanceOf` and `findCustomerEntitlementsForFeature` were already replaced by the shared cusEnt helpers in unit 6. Fixtures are on real rows since unit 4.

### 8 · [x] worker → hydrate a customer from Postgres when it has no state (pulled forward into unit 4; entity views still unit 6)

As previously planned: `getSubjectRows` → `subjectRowsToSubjectState` → initialize mutation → decide; catalog rows resolve through the cache. Open items unchanged: primary vs replica, Redis lag during shadow.

### 9 · [x] server → `Decision<Supported>`, unsupported as errors

**steps** — engine `models/common/decision.ts`: `UnsupportedDecisionReason`, `UnsupportedDecision`, `Decision<Supported>`; `TrackDecision = Decision<SupportedTrackDecision>`, `CheckDecision = Decision<SupportedCheckDecision>`; `isUnsupportedDecision` in `utils/decisionUtils/classifyDecisionUtils.ts` · server `balanceWorker/requireSupportedDecision.ts` is the one place an unsupported decision becomes `BalanceWorkerUnsupportedError` (`command_conflict` → 409 duplicate idempotency key, else 400); the track and check response builders take the supported type only · shadow and replay keep inspecting unsupported decisions through the predicate, since for them it is a verdict, not an error
**verify** — server typecheck; `balance-worker-track.test.ts` error contract once the server unit suite runs again

### 10 · [ ] worker → `infra/`

### 11 · [ ] sweep → integration pass + staging shadow

## Ordering and stacking

One stacked branch per unit (`gh stack`, base `og/balance-worker-observability`):
`state-structure` ✓, `one-record` ✓, `catalog-vocabulary`, `catalog-cache`, `catalog-wired`, `catalog-postgres`, `catalog-broadcast`, `engine-utils`, `postgres-hydrate`, `decision-shape`, `worker-infra`.

## Decisions

1. **Names.** `SubjectState`, `SubjectStateMutation`, `changes: RowChange[]`; `Catalog` for the by-id records compute receives; `CatalogKey` / `CatalogRow`; `catalogCache` for the worker abstraction; `CatalogRowsSource` for what fills it.
2. **Catalog is one in-process tier over Postgres.** No SQLite, no Dynamo. Decided 2026-09-16.
3. **Catalog rows are never state.** State references by id; rows are the shared types, not picks.
4. **Invalidation is pushed and org-scoped.** Drops products, features, base entitlements; keeps custom entitlements. Mutable-row ttl is the backstop.
5. **Response projection.** Server-side via `getApiBalance` over the returned row and the server's FullSubject.
6. **Revision semantics.** No state ≡ revision 0; initialize is the mutation 0 → 1; a `needsCatalog` reply consumes no revision.
7. **Entity subject states** deferred until entity commands are supported.
