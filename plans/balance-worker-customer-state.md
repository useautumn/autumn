# Balance worker: customer state as rows, outcomes as one mutation

2026-09-16 · og/balance-worker-observability · 9a728fcbb7

Cleanup of the business-logic layers before the stack merges for prod shadowing.
Two changes, one idea: the worker is a **mutation stream over the customer's rows**.

1. `CustomerMeteringState` becomes the customer-owned rows of `NormalizedFullSubject`, catalog kept apart.
2. `TrackOutcome | StateInitializedEvent` becomes one `CustomerStateMutation` whose `changes` are row-ops, the way `AutumnBillingPlan` is one object every billing action fills in.

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
┌─ CustomerState (one per customer, revisioned) ──────────────────┐
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

Rows are **lean on purpose**: each table gets its own zod schema in the engine with Postgres column names and only the columns check/track read. That is a deliberate near-duplicate of the `@autumn/shared` row types, so the engine stays dependency-free and small on the wire, in SQLite, and in checkpoints. A `satisfies Pick<DbCustomerEntitlement, …>` check in the server keeps each mirror assignable from the real row. `NormalizedFullSubject` → `CustomerState` is a pick, not a derivation. The catalog is exactly `SubjectCatalog` from `subjectQueryRow.ts:80`: initialize carries it today, the worker reads it from Postgres later.

### Entities: one blob per subject, not per customer

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
  apply                → patch the blob that owns ce_ent42; revision 7 → 8 on cus_abc
```

The engine's compute functions take a `SubjectView`: the customer blob plus the named entity's blob. Apply is generic because `changes` keys are the blob keys (`insertCustomerEntitlements` → `customerEntitlements`, and so on); a row's `internal_entity_id` says which blob owns it. Revision lives on the customer blob so the customer's mutations stay totally ordered. The customer-view aggregate across entities is out of scope until entity tracks are supported; Redis's `_aggregated` is likely deprecated, so the worker should not mirror it. The legacy `entities` jsonb map on one cusEnt stays an opaque field, same as the Redis hash field today.

### Mutation: one record, row-ops inside

```
┌─ CustomerStateMutation (the Kafka record, the receipt) ─────────┐
│ mutationId · fingerprint · requestId · identity · occurredAt    │
│ revisionBefore: 7 → revisionAfter: 8                            │
│ command:  { kind: "track", featureId, value, overageBehavior }  │
│ changes:  ┌───────────────────────────────────────────────┐     │
│           │ insertCustomerEntitlements   [rows]           │     │
│           │ updateCustomerEntitlements   [{id,before,after}]    │
│           │ deleteCustomerEntitlementIds [ids]            │     │
│           │ …Rollovers · …CustomerProducts · …UsageWindows│     │
│           └───────────────────────────────────────────────┘     │
│ result:   { status: "applied", appliedValue: 5 }   (per kind)   │
│ deduplicationExpiresAt                                          │
└─────────────────────────────────────────────────────────────────┘
```

```
command                                   changes it fills
initialize                          ──►   insert* for every row, from empty state
track 5, balance 100                ──►   updateCustomerEntitlements [{ balance: 100 → 95 }]
track 5, reject, balance 3          ──►   nothing (result.status = "rejected")
balances.create (future)            ──►   insertCustomerEntitlements
attach (future)                     ──►   insertCustomerProducts + insertCustomerEntitlements
```

`before` on an update is the stale guard `applyDeduction` does by hand today. `applyChanges` is generic: verify `before`, set `after`, insert, delete. It never knows what a track is.

### Flow after the change

```
server                 engine (pure)                 worker
─────────              ─────────────                 ──────
params → command  ──►  computeTrack({state,catalog,command})
                        → { kind:"new", mutation }
                                              ──►    writer.decide: dedup by (mutationId, fingerprint)
                                                     applyChanges(projected) · append · store.apply
rows ◄──────────────── decision { mutation, rows after }
rows + catalog → ApiBalance via getApiBalance
```

## Plan

Order: prove the mutation stream first, then swap the row vocabulary under it. The store restructure goes first because it has no design risk and every later diff shrinks.

### 0 · [ ] worker → `state/` as repos, actions, facade (pure move)

**goal** — the store reads as one write, three tables, a partition lifecycle; no behavior change
**steps** — `openStateDatabase.ts` · `repos/{partitionProgress,customerStates,trackReceipts}/` one query per file, `{ db, … }` · `actions/{readState, initializePartition, applyDurableMutations/, captureCheckpoint, restoreCheckpoint, pruneReceipts}` · `createStateStore.ts` with named methods replaces the class · consumer handler switches to `applyDurableMutations`
**verify** — every existing worker test passes untouched · `bun ts`

**scenarios** — none new; this is a move

### 1 · [ ] data model → one `CustomerStateMutation` record, end to end

**goal** — one record type on the log; the store applies row-ops without knowing the command
**steps** — engine `models/customerStateMutation.ts` (id, fingerprint, revisions, `command`, `changes`, `result`) · state becomes `customerEntitlements: Record<id, LeanCustomerEntitlement>` so changes address rows by id · generic `applyChanges` with `before` guards · `computeTrack` and `computeInitialize` return a mutation (revision 0 → 1 on initialize) · track invariants move from `superRefine` into compute tests · `MeteringRecord = CustomerStateMutation` · SQLite `mutation_receipts` replaces `track_receipts` and the initialization columns · `decide` absorbs `submitInitialization` · checkpoint carries states and receipts as opaque JSON, `ENGINE_SCHEMA_VERSION` stays 1 · follower handler has no type branch · fix the six shared fixture builders first
**verify** — engine unit tests · `bun test apps/balance-worker` · `packages/kafka` unit + integration · `server/tests/unit/balances/balanceWorker/request-integration.test.ts`

**scenarios** — track 5 on balance 100
- cap → one update `{ balance: 100 → 95 }`, result applied 5
- cap, balance 3 → `{ 3 → 0 }`, applied 3
- reject, balance 3 → no changes, result rejected insufficient_balance
- overflow, balance 3 → `{ 3 → -2 }`, applied 5
- apply with stale before (balance now 90) → StaleMutationError
- initialize twice, same id + same state → duplicate; different state → conflict
- follower replays a receipt the owner pruned → durable revisions order it
- restart from a checkpoint mid-partition → state and receipts identical, next offset correct

**open**
- ? initialize receipts now expire like track receipts; after expiry a replayed initialize sees "state exists" → already_initialized

### 2 · [ ] data model → rows with DB columns, catalog beside, subject blobs

**goal** — the engine's state is the customer's rows; catalog lives beside it; entities get their own blob
**steps** — engine `models/rows/` (lean zod mirror per table, DB column names) · `subjectState.ts` · `subjectView.ts` · `catalog.ts` (mirror of `SubjectCatalog`) · `utils/findCustomerEntitlementsForFeature` via catalog, replaces `featureStatesById` · SQLite `subject_states(partition_key, subject_key, state_json)` replaces `customer_states` · `readSubjectView({ identity, entityId })` replaces `readState` · `applyDurableMutations` loads owning blobs by `internal_entity_id` · `fullSubjectToCustomerState` is a pick over `NormalizedFullSubject` with a `satisfies Pick<DbCustomerEntitlement, …>` guard · initialize carries `{ state, catalog }`
**verify** — engine unit tests · `full-subject-to-metering-state.test.ts` rewritten as a pick test · worker + server unit suites

**scenarios** — initialize
- pro with api_calls 1000/mo → one customer_products row, one customer_entitlements row, catalog has entitlement + feature + product
- api_calls has two cusEnts (pro + add-on) → both rows present; track still refuses
- entity-level cusEnt → lives in `cus_abc:ent_42`, not the customer blob; track refuses
- 100k entities → 100k small `subject_states` rows; a customer-level track reads the customer blob only

### 3 · [ ] server → rows out, ApiBalance via shared utils

**goal** — the server speaks params and API; the worker speaks rows; no hand-rolled projection
**steps** — `validateBalanceWorkerRequest` stays · `validateMeteringEntitlement` deleted; engine `classifyTrackCommand` owns state-shape reasons · decision returns `{ mutation, customerEntitlements after, catalog refs }` · server builds the touched `FullCustomerEntitlement` and calls `getApiBalance` · delete `meteringBalanceToApiBalance` · shadow operator compares rows
**verify** — `request-flow.test.ts`, `balance-worker-track.test.ts`, `shadow/*.test.ts` · one Redis-vs-worker response equality assertion

**scenarios** — track 5 on pro api_calls 1000/mo, apiVersion v2
- worker `balance` deep-equals the Redis path's response for the same subject
- reject raises `InsufficientBalanceError` with today's fields
- check required 10 on balance 5 → allowed false, remaining 5

**open**
- ? wire shape: rows + catalog refs (recommended) vs `ApiBalanceV1` computed in the worker

### 4 · [ ] worker → `infra/`

**goal** — layers that know nothing about balances stop importing the engine
**steps** — `infra/{checkpoint,s3,health,logging}` now that states and receipts are opaque · `partitions/` drops its processor type import · import-boundary unit test like `functionConventions.test.ts`

### 5 · [ ] sweep → integration pass + staging shadow

**steps** — `bun t` on `server/tests/integration/balances/{track,check}` · fresh SQLite + checkpoint namespace on staging · one shadow cohort window against STG-016
**verify** — shadow operator reports full-state match; cold checkpoint restore works

## Ordering and stacking

One stacked branch per unit (`gh stack`, base `og/balance-worker-observability`): `state-structure`, `one-record`, `state-rows`, `server-rows-out`, `worker-infra`.

## Decisions to make before unit 1 (unit 0 needs none)

1. **Names.** `CustomerState` + `CustomerStateMutation` + `changes` (this doc), or keep `MeteringState` / `MeteringMutation`? The billing analogue is `AutumnBillingPlan`; "plan" reads as pre-execution, and here the record is post-decision, so `mutation` fits.
2. **Catalog source.** Initialize carries `SubjectCatalog` now; the worker reads catalog from Postgres when it starts reading Postgres. State never embeds catalog fields.
3. **Row schemas.** Decided: engine-owned lean zod mirror per table, DB column names, only the columns the engine reads.
4. **Response projection.** Server-side via `getApiBalance` on rows + catalog (recommended) vs worker-side.
5. **Revision semantics.** No state ≡ revision 0; initialize is the mutation 0 → 1. Shadow and tests currently expect an initialized customer at revision 0.
