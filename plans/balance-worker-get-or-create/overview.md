---
author: john + claude
feature: balance-worker-get-or-create
date: 2026-09-22
status: draft, not yet approved
---

# Get-or-create on the balance worker

Scope: customer creation only: `customers.create` / `customers.get_or_create`, and `customer_data`
on check and track. Create is the **first `applyPlan`**: the same command, converter and router every
billing action will use later (`plans/balance-worker-apply-plan/`). `customers.get` comes first:
`get_or_create` is `customers.get` plus create-on-a-miss, and both are on the hot path.

Parked: `entity_data` and the entities restructure (per-entity balances on `ce.entities`, the allocated
invoice on entity creation, entity default products), and queued tracks that name a missing customer.
Both wait for an `/investigate` into whether anyone still uses them.

Units: `units.md`.

## What exists today

### create: two phases, elected by a Postgres row lock

```
createCustomerWithDefaults
 phase 1  one PG txn (executeAutumnCreateCustomerPlan.ts:42-66)
          insertOrClaimEmail        customers (claim: id-less row)
          syncAutoTopupPurchase…    auto_topup_limit_states
          executeAutumnBillingPlan  cusProducts cusEnts cusPrices
                                    rollovers pools
          loser: INSERT blocks on the winner's row → "existing"
 phase 2  creator only
          syncCreatedCustomer…      stripe_id → syncV2 → executor
          getOrCreateStripeCus…     customers.processor
          executeStripeBilling…     Stripe sub, subscriptions,
                                    invoices
          finalizeCreateCustomer    cusProducts.subscription_ids
          finally                   products.updated, billing.updated
```

- The election is the row lock and nothing else: no Redis lock, and the Stripe subscription uses a
  random idempotency key (`executeStripeSubscriptionOperation.ts:121-136`).
- `customers.create` is get-or-create too. Both routes run `getOrCreateCachedFullSubject`: probe
  (Redis, then PG) → miss → create → `updateCustomerData` → `autoCreateEntity` (`:47-129`).
- Every phase-2 write except syncV2 is a column the worker does not hold: `processor`,
  `subscription_ids`, `subscriptions`, `invoices`. syncV2 (only when `stripe_id` is sent) writes
  customer products the worker **does** hold, and nothing evicts after it inside create.
- Phase 1 committed + phase 2 failed is permanent: retries see "existing", replay refuses
  `autumn_committed` (`replayFailedCustomerCreation.ts:13-28`).
- Bug: `scheduled_ids` and the pool's `stripe_subscription_id` are stamped onto the plan after phase 1
  inserted the rows, and finalize persists only `subscription_ids` (`finalizeCreateCustomer.ts:28-34`).
- Every integration test creates its customer through `customers.create` with a `stripe_id`
  (`initCustomerV3.ts:61-86`), so create's path is under every suite.

### inline creation

- check and track create only below API 2.1 (`getCheckDataV2.ts:77`, `runTrackV3.ts:32`), with or
  without `customer_data`. From 2.1 `customer_data` is ignored and a missing customer is a 404.
- `autoCreateEntity` is legacy, not billing v2: it decrements the seat balance and rewrites
  `ce.entities` (both rows the worker holds), attaches no entity defaults, 400s paid seat features,
  and releases its lock before the insert, so a second request can decrement twice
  (`createEntityForCusProduct.ts:122-214`). `entities.create` attaches defaults through the executor.
- Other inline creators stay out of scope: `/v1/usage`, legacy attach/checkout, setup_payment,
  entities.create, product check, RevenueCat, Vercel, billing.import, recovery replay.

### the worker path today

- `validateBalanceWorkerRequest` 400s `customer_data` / `entity_data` on every API version.
- `ENTITY_NOT_FOUND` is unmapped on the server and becomes a 500 (`balanceWorkerErrors.ts:147`).
- A queued track for a missing customer is accepted (202), then dropped as refused, and its
  idempotency key stays claimed (`settleQueuedFailure.ts:29-77`).
- The worker never caches absence: a miss throws and the next command reads Postgres again.
- The committer lands five balance tables. Inserts are `INSERT (keys of row)` with no `ON CONFLICT`;
  the fold keys rows on `id`, which is wrong for `customers` and `entities` (PK is `internal_id`).
- A 23505 on anything but a lock row is `FlushRecordRefusedError` → 500 (`landFlush.ts:50-73`).
- Row schemas are strict picks: `customers` lacks NOT NULL `org_id`, `env`, `created_at`, plus
  name, email, processor, metadata; `customer_products` lacks product_id, trial_ends_at,
  subscription_ids and ~15 more. A pick cannot be inserted.
- Every log reader parses strictly: a new command type or table parks an old worker's partition and
  makes herald skip the record. `recordToBalanceWebhooks` reverts changes before it checks the type.
- `initialize` is dead in postgres mode, and on a cold customer it appends a record the committer
  refuses while telling the caller "initialized". Only operator tooling calls it.
- The worker never writes `customer_lsns`; replica routing depends on it (`resolveSubjectReadDb.ts:59`).
- Client deadline is 1s, with no retry on 409 or 503.

### found on the way: hydration can read Postgres behind the log

```
track −5   decided → Kafka → caller answered → pins released
           store still pending
evict/LRU  drops the customer (nothing pinned it)
next cmd   hydrates from PG, which lacks −5
           memory under-counts usage until the next eviction
```

`evict` waits only for commits still in `pendingByCustomerKey`; a log-durable track leaves it at the
append (`commit.ts:102-113`), and the subject map evicts any unpinned entry by LRU. Unit 0 fixes it:
hydration waits for the partition's pending writes to land before it reads.

## Target model

### the wire carries whole rows; state keeps a pick

```
wire, log   insert customers { every column PG needs }
            update customer_products { subscription_ids }  any column
state       pick(row)            only what decisions read
committer   writes exactly the columns the change names
```

- **`customers.get` sets the pick.** Units 1–2 widen it to what the API customer renders: full
  `customers` and `customer_products` rows. Subscriptions are never subject state: the server reads
  them from Postgres alongside the worker read. Invoices, entity aggregates (API < 2.4) and
  license-linked products stay out too.
- **Freshness of widened columns is the Redis cache's contract today**: every writer that invalidates
  the cached subject already evicts the worker (`invalidateCachedFullSubject`). Four writers patch the
  cache in place instead and must evict too: `updateCustomerData`, `publishBillingTransition`,
  `updateEntity`, and `getOrCreateStripeCustomer`'s processor write. Each evict goes when its writer
  becomes a worker command.
- Cost: name and email sit in the Kafka log, the same exposure the Redis cache has today.

### one command: `applyPlan`; inserting a customer is its precondition

```ts
// always durability "store"
ApplyPlanCommand { ...base, catalogRows, ops: PlanOp[] }
// this plan's only op; tables: customers · customerProducts ·
// customerPrices · customerEntitlements · rollovers
PlanOp { op: "insert", table, row }
ApplyPlanReply {
  result: { status: "applied" | "customer_exists" },
  state, catalog,
}
```

- An op inserting the customer requires the customer to be absent; otherwise nothing is written and
  the reply is `customer_exists` with the state. An entity insert will work the same way, later.
- There is no separate `create` command. Create customer, create entity, attach, the Stripe
  link-back and syncV2's import are all cases of one unit; attach adds op kinds (`update`,
  `increment`, `transfer`) and a structural-revision guard, not a new path.

### one server router: `executeAutumnBillingPlan`

```
executeAutumnBillingPlan({ ctx, autumnBillingPlan })
│
├ routeAutumnBillingPlan
│   worker    rollout on · customer has an id · every facet routable
│   postgres  otherwise: today's steps, unchanged
│
├ worker lane
│   insertCustomer? claimCustomerByEmail (PG) → claimed ⇒ exists
│   autumnBillingPlanToPlanOps → client.applyPlan
│
└ postgres lane
    insertCustomer? one txn: insertOrClaimEmail + today's steps

→ { status: "applied" | "customer_exists" }
```

- `insertCustomer` joins `AutumnBillingPlan` beside the existing `insertEntities`. Create's plan
  becomes `{ insertCustomer, insertCustomerProducts, pooledBalancePlan }`.
- The transaction `executeAutumnCreateCustomerPlan` opens today moves into the postgres lane. On the
  worker lane the atomic unit is the one mutation.
- Routable facets grow unit by unit: `insertCustomer`, `insertCustomerProducts` (no licenses, no
  custom catalog rows), `insertEntities`. Pools, licenses and custom rows take the postgres lane.
- The email claim stays a Postgres step: it gives an id-less row an id, and the worker keys on the id.

### two concurrent `get_or_create`, trial default

```
 A: get_or_create cus_abc              B: same, same instant
 probe miss · setup · compute          probe miss · setup · compute
 executor → worker lane                executor → worker lane
      │                                     │
 ┌──── worker, cus_abc's partition ───────────────────────┐
 │ A  hydrate: miss → decide: no state → insert           │
 │    → Kafka → PG → reply applied                        │
 │ B  decide after A: projected state → customer_exists   │
 │    reply waits until earlier writes land in PG         │
 └────────────────────────────────────────────────────────┘
 A: applied → phase 2, unchanged       B: existing → getFull (primary)
    Stripe customer + trial sub           fresh: A's rows are in PG
```

| guarantee | mechanism |
|---|---|
| one creator | same partition, `decide` is synchronous |
| no Stripe for a ghost | `applied` only after the Postgres commit (`store`) |
| the loser's re-read is fresh | a `store` reply waits for every earlier write to land |
| a Postgres-side creator racing (claim, Vercel, import) | 23505 → `SUBJECT_EXISTS` → evict → treated as existing, re-read |
| a timeout after the write landed | retry the same command id once: `DUPLICATE_COMMAND` means it was ours, so phase 2 still runs |
| a track decided on a create that is then refused | a write decided on an unlanded `store` write inherits `store`: the track hears the refusal instead of a false success |

### get-or-create is one wrapper, used three ways

```
withCreateIfMissing({ ctx, customerId, customerData, run })
  run({})
  CustomerNotFound → createCustomerWithDefaults (created | existing)
                   → run({ createdCustomer }) once more
  any other error, or a second CustomerNotFound → thrown

get_or_create   = withCreateIfMissing(read subject) → fill → tail
check, track    = withCreateIfMissing(send to worker) + fill (< 2.1)
```

- **One concept, one place.** "Get, and on a miss create and get again" is what
  `getOrCreateCachedFullSubject` already does inline. Pulling it out makes the endpoint and check/track
  the same code. When `customers.get` moves to the worker, `get_or_create` moves with it.
- **The retry is the read.** After a create the response is built by the same `run` that missed, not
  from the in-memory `FullCustomer`. One response builder; the cost is one read, only on creation.
- **The retry is handed the customer create returned**, never `ctx`: an id-less customer can only be
  read back by its new internal id, and the re-read goes to the primary.
- **Where it sits.** Inside `withIdempotencyKey` for track, so a retry never re-claims the key. Around
  the whole fan-out, so an `event_name` track re-runs every feature. The worker command id is reused on
  the retry: the miss happened before `decide`, so nothing was recorded.
- **The retry must see the create.** The worker lane replies only after Postgres commits (`store`). A
  Postgres read goes to the primary because create stamps `customer_lsns`, which is why the committer
  must stamp it too (decision 10).
- **`customer_data` means the same thing everywhere**: create with it on a miss, fill an existing
  customer's empty name/email and a changed `send_email_receipts` on a hit. The fill is a sibling
  step, not inside the wrapper: `get_or_create` compares against the row it read; check and track on
  the worker have no row, so their fill is a conditional `UPDATE`, one Postgres round trip per call (open question).
- **`get_or_create` keeps the rest of its tail**, around the wrapper: 503 shedding and the recovery
  queue, `ensureStripeCustomerFromCustomerData`, legacy `entity_data` via `autoCreateEntity`, and the
  cache write. It patches its response from the fill's returned row.
- From API 2.1 check and track ignore `customer_data` entirely (no create, no fill), as legacy does,
  instead of 400ing it.

Rejected shapes:

| shape | why not |
|---|---|
| check existence before every command | a second round trip on every check and track |
| command carries the create plan, worker creates inline | computes defaults (DB reads) on every call; Stripe can't run in the worker |
| handle the miss in the worker client | the client is transport; creation needs Stripe and the catalog |

### DRY: what create builds now, what attach reuses

```
built now                     create uses          attach adds later
────────────────────────      ─────────────        ────────────────────
AutumnBillingPlan             insertCustomer       nothing new
executeAutumnBillingPlan      2 facets routed      more facets
applyPlan command             insert ops           update/incr/transfer
autumnBillingPlanToPlanOps    2 facet files        1 file per facet
committer tables              cus, cusProd, cusPr  contributions, …
whole-row changes + pick      inserts              updates
store inheritance             create               every applyPlan
withCreateIfMissing           get_or_create, check, track  —
create-only                   claimCustomerByEmail, customer_exists
```

Nothing create builds is replaced when attach routes. Attach needs four things create does not:
more op kinds, the structural-revision guard, setup reading the worker (`setupFullCustomerContext`
is the one seam), and N-entity mutations.

One honest cost: while any plan is still refused to the postgres lane, a facet that routes lives
twice, as its PG step and as its op converter. A facet's PG step goes only when no refusal can send
that facet to the postgres lane any more.

## Races

| race | outcome |
|---|---|
| two `get_or_create`, same id | one `applied`, one `customer_exists` |
| `get_or_create` vs a track for the new customer | the track 404s → creates → gets `existing` → resends |
| two tracks for a new customer (API < 2.1) | both create, one wins, both resend and apply |
| email claim racing a worker insert of the same id | PG unique → `SUBJECT_EXISTS` → existing |
| a Postgres-lane creator racing (Vercel, import, id-less) | same |
| a track decided on an unlanded create that is refused | inherits `store`: it gets the error and retries onto the real rows |
| a server timeout after `applied` | same command id → `DUPLICATE_COMMAND` → applied → phase 2 runs |
| owner moves mid-create | the Kafka fence rejects the old owner; the retry gets one answer |
| evict or LRU before the store | unit 0 |
| phase 2 fails after `applied` | as today: recovery stage, manual review |

## Decisions

| # | question | recommendation |
|---|---|---|
| 1 | A `create` command, or `applyPlan` with a precondition? | `applyPlan`. One unit for create, attach, link-back, import and later entity create. |
| 2 | What goes on the wire, and what does the worker hold? | Whole rows on the wire. State holds what `customers.get` renders; writers not yet on the worker keep it fresh by evicting, the same contract the Redis cache has today. |
| 3 | Stripe link-back (`subscription_ids`) | Stays a Postgres write until the `update` op lands (apply-plan). No evict: it is not worker state. Persist `scheduled_ids` there too (the found bug). |
| 4 | syncV2's import in phase 2 writes rows the worker holds | Invalidate after it, as `/billing.sync_v2` already does. This plan's only interim evict; it goes when syncV2's facets route. |
| 5 | Below 2.1, legacy check and track fill an existing customer's empty name/email on every call | **Decided:** check, track and `get_or_create` all follow `get_or_create`: fill on every call. One conditional `UPDATE`, run beside the command. |
| 6 | Queued track below 2.1 for a missing customer | **Parked.** Leaning to `consumeTrack` handling it. `/investigate` whether anyone uses the path first. |
| 7 | `entity_data` | **Parked**, with the entities restructure. `/investigate` whether it is used; deprecating it is an option. The worker path keeps refusing it. |
| 8 | Id-less customers (`customer_id` null) | Always the postgres lane: there is no partition key. |
| 9 | Pools, licenses and custom catalog rows on a default plan | Postgres lane until apply-plan lifts them. |
| 10 | `customer_lsns` | The committer stamps it for `applyPlan` records, inside the flush transaction. |
| 11 | `initialize` | Not reused. It stays for sqlite and operator tooling; retire it separately. |
| 12 | Log readers | Readers first: herald and balance-webhooks learn `applyPlan` and the new tables in unit 3, before the server emits in unit 4. |
