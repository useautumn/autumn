# Units of work

Order: fix hydration → the worker serves a customer's whole subject (`read`) → `customers.get` reads it →
`get_or_create` = create-if-missing around that read → check/track create on miss → create itself moves
onto the worker. Each unit ends with a passing test and stops for review.

`customers.get` comes first because `get_or_create` is `customers.get` plus "create on a miss": build the
read once, and both hot-path endpoints use it.

| # | unit | ends with this passing |
|---|---|---|
| 0 | **Dropped for now.** A subject evicted or LRU-dropped while a log-acknowledged write is still on its way to Postgres can re-hydrate without it. If it matters, the fix belongs at eviction (keep a subject pinned until its writes are stored), not in every cold load. | — |
| 1 | **The worker serves a customer's whole subject.** Whole `customers`, `customer_products` and `customer_entitlements` rows in state (hydration already selected `*`; only the envelope narrowed it); rendered-only columns are optional so old log records parse, and are stripped from the log's `after` snapshot. `read` command (engine type + parser, worker `readCurrentSubject` shared with `check`, `/v1/read`, client `read`). Subscriptions are never state. | worker integration `a read returns the whole customer…` (read after a track shows 95; name, org, `subscription_ids`; missing → `CUSTOMER_NOT_FOUND`); `refills it first` (check path). Engine 198/198, worker unit 549/549, postgres 33/33. **Done.** |
| 2 | **`customers.get` on the worker.** `balanceWorker/subject/readBalanceWorkerSubject` = worker `read` + subscriptions (`SubService.getInStripeIds`) + invoices only on expand (`InvoiceService.list`, 10) → `workerStateToFullSubject` (zod-parsed shared rows, no replaceables). `getApiCustomerByRollout` switches for customer views; entity views stay on Postgres. No evicts (removed): writers of the widened columns are the open follow-up below. | typecheck; server unit suite at baseline (52 failures, identical on clean HEAD: the TEMP hard-coded rollout flag). Integration suites not run yet. **Code done.** |
| 3 | **`get_or_create` on the worker.** `balanceWorker/subject/getOrCreateBalanceWorkerSubject` = `withCreateIfMissing(readBalanceWorkerSubject)` → `updateCustomerData`. `getOrCreateApiCustomerByRollout` switches when the request has a customer id and no entity id; id-less and entity requests stay on the legacy path. 503 shedding, recovery queue, `ensureStripeCustomerFromCustomerData`, `getApiCustomerV2` shared. | as unit 2. `crud/customers/create*` and `get-customer*` on the rollout still to run. **Code done.** |
| 4 | **check and track create on miss.** `withCreateIfMissing({ enabled: apiVersionCreatesCustomer({ ctx }) })` around the sync worker call: track inside the idempotency claim and around the fan-out, check around read and deducting check. `validateBalanceWorkerRequest` no longer refuses `customer_data` anywhere (queued paths just ignore it); `entity_data` still refused. `ENTITY_NOT_FOUND` → 404. | typecheck; server unit suite at baseline. `track-misc` misc1, `check-misc` V1 auto-create, `check-race-condition` still to run. **Code done.** |
| 5 | **Create is one `AutumnBillingPlan`; the executor writes the customer's rows atomically.** `insertCustomer` on the plan (set by `computeCreateCustomerPlan`). `executeAutumnBillingPlan` reads as three phases: catalog rows → `orchestrator/executePostgresPlan` (one transaction: `insertCustomer` as step 0, stopping with `customer_exists` if taken, then every customer-row step) → `orchestrator/executePlanFollowUps` (`startBatchTransitions`, one-off + auto top-up rebalances, subscriptions, invoice, SQS, license reconcile). License transitions split into pool-row writes (inside) and `startBatchTransitions` (after). The transaction boundary is the future `applyPlan` boundary. `executeAutumnCreateCustomerPlan` is one executor call plus the re-read; `finalizeCreateCustomer` links back through the executor (`subscription_ids` + `scheduled_ids`). | typecheck; server unit suite at baseline. `crud/customers/create*` and a billing sweep (attach, licenses, pooled, one-off, auto top-up) still to run. **Code done.** |
| 6 | **The worker applies an insert plan.** Engine `commands/applyBillingPlan/` (insert ops on customer, products, prices, entitlements, rollovers; a customer-inserting plan starts at revision 0; inserting a present customer → `customer_exists`). Worker decides it with `store` durability and replies once stored. Committer lands `customers`, `customer_products`, `customer_prices` inserts only from `applyBillingPlan` (initialize baselines still refused); 23505 → `STALE_SUBJECT`, no evict. Writer: a write decided on an unlanded `store` write inherits `store`. Postgres `ARRAY[…]::jsonb[]` / `text[]` inserts. Client `applyBillingPlan`, 5s deadline. `recordToBalanceWebhooks` checks the type before reverting. `customer_lsns` stamping moves to unit 7. | worker integration (13/13): create plan → rows in PG with arrays exact → a track moves its balance to 95; two concurrent creates → `applied` + `customer_exists`, one customer; a cusProduct id collision → `STALE_SUBJECT`, no customer, clean retry applies. Store inheritance: writer unit test (red without the rule). SQL rendering unit tests. Kafka suite: the same 11 failures as clean HEAD (local S3 + replay). **Done.** |
| 7 | **Create takes the worker lane; updates and entities included.** Engine: `update` ops on `customer` (by `internal_id`) and `customerProducts`; the command names `entityIds` and one mutation spans the customer and those entities (`mergeCustomerAndEntities` → decide → `splitCustomerAndEntities`, each owner stores its part); an insert for an unnamed owner is refused. Postgres: `customers` keyed on `internal_id`. Committer: a plan's updates are a plain SET (last write wins, as the Postgres lane); one record, one verdict, so a plan over several subjects is atomic. Worker: a row it lacks → drop copy, `STALE_SUBJECT`; a private (SQLite) store refuses plans. Server: `updateCustomer` facet; router (rollout · one customer · every entity named by id · only worker facets · no license/rollover/schedule rows) → `executeWorkerPlan` = `claimCustomerByEmail` → `applyBillingPlanOnWorker` (fresh command id per attempt; one resend on unknown/stale) → Postgres fallback if still stale → `customer_lsns` stamp. Stripe link, link-back and `customer_data` fill go through the executor. | worker integration 20/20 (updates, overwrite, poison update keeps the partition, entity plan lands per owner, entity collision refuses the customer's change, missing entity); worker unit 551 (SQLite refusal); engine 210; postgres 41; server billing-plan unit 16; server suite = clean-HEAD baseline. `crud/customers/create*` still to run. **Code done.** |
| 8 | **Every plan routes; the all-or-nothing gate goes.** Engine ops: delete (products cascade prices, grants, rollovers; each row once), grant update + increment, entity insert (the plan names and creates the entity), customer update `whereUnset` (currency lock); the worker fetches any catalog row a plan's new rows reference. Postgres/committer: `entities` keyed on `internal_id`; every plan update is a plain SET. Server: one converter per facet under `planOps/{customer,entities,customerProducts,customerEntitlements}`; routing only needs one customer by id, every entity named, no license seats. `executeWorkerPlan` = worker mutation → `executePostgresRemainder` (license updates/pools, pooled balances, license transitions, schedule phases, replaceables; skipped when empty). Auto top-up deltas are increments in the mutation; one-off rebalance becomes a plan of balance changes. | worker integration 24/24 (delete cascade, grant update + increment after a track, entity created with a product, currency lock once); engine 216; postgres 42; server billing-plan unit 22; server suite = clean-HEAD baseline. Known gaps: pooled rows land in Postgres while the worker holds pools; rows the worker doesn't hold take stale → resend → Postgres fallback. **Code done.** |

**`executeAutumnBillingPlan` shape (after unit 8):** 1 `resolvePlanCatalog` → 2 `writePlanRows` (customer rows via worker | Postgres, then Postgres-only rows; one transaction on the Postgres path) → 3 `applyPlanRebalances` (one-off + auto top-up, Postgres, after commit: the one-off reads the customer back, which inside the transaction can deadlock with a worker reset) → 4 `runPlanSideEffects`. Temporary until rebalances move onto the worker (precompute the one-off like auto top-up; deltas as increments).

## Folder structure, units 1–3

```
packages/balance-engine/src/
├── commands/read/types/readCommand.ts        new: base + { type: "read" }
└── models/subject/
    ├── rows/workerCustomer.ts                 full customers row
    └── rows/workerCustomerProduct.ts          full customer_products row

packages/postgres/src/subjects/repos/getSubjectRows/
└── subjectRowsSql.ts                          wider selects

apps/balance-worker/src/
├── processor/actions/readCurrentSubject.ts    new: current → wait → state
├── processor/commands/read.ts                 new: readCurrentSubject
├── processor/commands/check.ts                readCurrentSubject + compute
└── http/handlers/receiveRead.ts               new

packages/balance-worker-client/src/
├── commands/sendRead.ts                       new
└── contracts/read.ts                          new

server/src/internal/balanceWorker/            the worker's shared server glue
└── subject/
    ├── readBalanceWorkerSubject.ts            read → + subscriptions (+ invoices)
    │                                          → FullSubject
    ├── workerStateToFullSubject.ts            state + catalog → FullSubject
    ├── withCreateIfMissing.ts                 run → miss → create → run

server/src/internal/customers/actions/
├── getApiCustomerByRollout.ts                 + worker switch   (unit 2)
└── getOrCreateApiCustomerByRollout.ts         + worker switch   (unit 3)
```

Placement rules this follows:

- **`internal/balanceWorker/` is the worker's shared server glue**, organised by concept (`subject/`
  first). Customers, check/track, `entities.get` and billing setup all call it. The existing
  `balances/balanceWorker/` files move over later, the shared ones only; balances-specific ones stay.
- **All new worker-path code lives in `internal/balanceWorker/subject/`**, get-or-create included; the
  customers domain only gains the one-line switches.
- **The legacy path is untouched; the switch is one line in the existing `…ByRollout` file.**
- **Nothing goes in `customers/cache/fullSubject/`**: that is the Redis cache being retired.
- **"Subject", not "customer", in names that return a `FullSubject`.**

## Open follow-ups (decided to plan, not built)

- **Writers of the columns the worker now serves bypass it, so `customers.get` on the worker can go stale.**
  No evicts in new code. The pattern exists now: write through the executor with the `updateCustomer` /
  `updateCustomerProducts` facets, which route to the worker (create's own writes do). Still to move: the
  ~32 other `CusService.update` call sites, `getOrCreateStripeCustomer`'s other callers, and
  `publishBillingTransition` (its preserved cache skips the invalidation that evicts the worker).
- **Update-only plans from any action now route to the worker** (cancel, uncancel, …), while the same
  actions' other facets stay on Postgres. Fine while nothing ships; attach-scale routing closes it.

- **Done: `balanceWorker/subject/withCreateIfMissing`** is the one place `customer_data` takes effect for
  get_or_create, check and track: create on a miss, then fill + `create_in_stripe` on the row `run` returns
  (check/track create only below API 2.1; the fill applies on every version), written through the executor.

## Parked, pending an `/investigate` into usage

- `entity_data` and the entities restructure: per-entity balances on `ce.entities`, the allocated
  invoice on entity creation, entity default products. Deprecating `entity_data` is an option.
- Queued tracks below 2.1 that name a missing customer (leaning: `consumeTrack` handles it).

## Parked, not handled yet

- The worker read for API < 2.4 (entity roll-ups are computed in SQL today) and for customers with
  license-linked products (left out of the worker's state).

## Later, owned by `plans/balance-worker-apply-plan/`

- The `update` op: the Stripe link-back, checkout's enable-immediately link-back and
  `promotePendingCustomerProducts` go through the worker; each routed writer drops its evict.
- Pools, licenses and custom catalog rows on create.
