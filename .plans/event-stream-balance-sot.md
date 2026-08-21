# Event stream as source of truth for customer balances

Research note. Not an implementation plan. The goal is to decide *what* would have to be true for an event stream to replace Redis as the durability source of truth, without pretending deduction is a simple decrement.

Related existing work in this repo:

- [check-reserve/01_mutation_logs.md](./check-reserve/01_mutation_logs.md) — mutation receipts + Redis Streams as the durability path for Postgres sync
- [pooled-balances/balance-sync-correctness.md](./pooled-balances/balance-sync-correctness.md) — Redis remaining vs Postgres structural writes
- [check-reserve.md](./check-reserve.md) — why snapshot sync loses deductions on cache eviction
- Current apply path: `executeRedisDeductionV2` → Lua `deductFromSubjectBalances` → `SyncBatchingManagerV3` → `syncItemV5` → Postgres
- Current analytics path: `EventBatchingManager` → Tinybird HTTP + SQS `InsertEventBatch` → Neon/Postgres events

---

## 1. What Redis is actually the source of truth *for*

`getCachedFullSubject` does not store remaining balances on the subject blob. The cached subject is a **structural view**: products, entitlement definitions, flags, licenses, subscriptions, invoices, feature membership. Live remaining lives in **per-feature Redis hashes**. On read, the subject is hydrated from those hashes, then lazy-reset, usage-window reset, and pending migrations run.

So today there are already four stores, and people say "Redis is SoT" as if it were one thing:

| Store | What it owns | Freshness |
| --- | --- | --- |
| Redis balance hashes + Lua | Remaining, rollovers, usage-window counters, lock receipts, aggregated hashes | Authoritative for check/track |
| Redis FullSubject blob + `subjectViewEpoch` | Grant graph / shape of the customer | Authoritative for "which buckets exist" on the hot path |
| Postgres `customer_entitlements` / rollovers / usage_windows | Durable remaining *and* structure | Eventually consistent remaining (snapshot flush). Authoritative for billing/attach/reset |
| Tinybird + Neon `events` | Track intents + post-hoc `deductions` JSON | Best-effort analytics. Not used to reconstruct remaining |

The dangerous part is not "we cache a customer." It is that **remaining is only durable if the snapshot flush lands**, and the flush re-reads Redis. If the hashes are evicted first, the deduction vanishes from Postgres. That is already documented. Stripe webhooks, attach, pooled rebalance, and invalidation all delete or replace that cache.

A second dangerous part: **structure is written in Postgres, remaining is mutated in Redis**. Pooled billing, resets, attach, and license changes race the usage path. `subjectViewEpoch` is the fence on the Redis side. There is no single ordered log that contains both.

---

## 2. What happens on one track

`runTrackV3` → `runRedisTrackV3` → `executeRedisDeductionV2` is not "subtract N from a counter."

### 2.1 Before Lua (TypeScript, state-dependent)

`prepareFeatureDeductionV2` builds the allocation inputs from the live `FullSubject` and org feature catalog:

1. **Feature expansion.** A `feature_id` track can also hit credit-system parents. An `event_name` can expand to many features. AI credit systems convert tokens → dollars via Models.dev + markups (`computeCreditCosts`).
2. **Entitlement selection.** Only in-status products. Optional `customerEntitlementFilters`. Entity vs customer context.
3. **Sort order** (`sortCusEntsForDeduction`): entity-vs-customer, boolean, credit systems last, unlimited first (then hoisted to the front as an infinite sink), resetting before lifetime, interval length, expiry, entity id, main product before add-on, prepaid before pay-per-use, `created_at`.
4. **Per-entitlement clamps.** `usage_allowed`, `overage_allowed` controls, `min_balance` / `max_balance` from max overage and starting balance, unlimited sink.
5. **Spend limits** and usage-based entitlement ids (for overage headroom).
6. **Usage windows.** Resolved against the full relevant feature set (so `set_usage` on a member cannot bypass a parent cap). Filtered by event properties. Calendar vs billing-cycle anchors. Unlimited ents skip windows entirely.
7. **Rollovers** flattened and sorted oldest-`expires_at` first, each with its credit cost.
8. **Lock receipt** params if this is a reserve/check-with-lock.

None of this is in the incoming track payload. It is a function of **current snapshot + current catalog + now**.

### 2.2 Inside Lua (atomic apply)

`deductFromSubjectBalances` is a single-threaded state machine on the customer's hash-slot keys:

1. Compare `expected_subject_view_epoch` — abort `SUBJECT_VIEW_CHANGED` and retry after refresh.
2. Idempotency key — skip already-applied features; 409 only if *every* feature is a replay.
3. Load hashes into an in-memory context. Missing ents → `SUBJECT_BALANCE_NOT_FOUND`.
4. Optional **lock unwind** (finalize): replay stored provenance backwards, decrement usage windows, fold leftover into the forward amount.
5. **Pass 0:** rollovers, oldest first.
6. **Pass 1:** main balance, floor at 0.
7. **Pass 2:** negative if `usage_allowed`, gated by spend limits and usage-window headroom.
8. Credit-cost conversion on every bucket.
9. Entity-scoped nested balances when tracking an entity.
10. `overage_behaviour`: `cap` (keep partial), `reject` (return `INSUFFICIENT_BALANCE` and **do not apply writes**), `overflow`.
11. Increment usage-window counters only for real positive consumption (not refunds, not `target_balance`, not granted-balance edits). Locks count at lock time.
12. Write lock receipt **before** applying pending writes, or apply nothing.
13. Flush entitlement hashes, aggregated hashes, usage-window counters.
14. Emit `mutation_logs` and `usage_window_mutations` — identifier-based deltas, not Redis paths.

Lua is the only place today where "did this track succeed?" and "what remaining is now?" are decided together.

### 2.3 After Lua (side effects that are not remaining)

In request order, after a successful apply:

- Allocated invoices for usage-based allocated entitlements (sync, can trigger rollback of the Redis apply).
- In-memory `FullSubject` patched so the response is consistent.
- Track webhooks (threshold / feature alerts).
- Auto top-up enqueue (SQS, burst-suppressed).
- `SyncBatchingManagerV3`: mark dirty selectors, coalesce ~1s, `syncItemV5` claims dirty state and **snapshot-flushes current Redis remaining** to Postgres. Not the mutation logs.
- `EventBatchingManager`: 350ms / 200 events → Tinybird HTTP (errors swallowed) + SQS insert into Neon events.

`mutation_logs` are already computed. They are used for the public `deductions[]` on the track response and the Tinybird event. They are **not** the Postgres sync payload. Postgres still copies the later snapshot.

### 2.4 Other writers of remaining

A stream that only contains tracks cannot rebuild remaining. These also change balances and often change the *shape* of the snapshot:

- Lazy reset on cache read + cron reset (`processReset`, rollovers created, `next_reset_at`).
- Invoice-owned resets (`reset_by_invoice`).
- Attach / update / cancel / checkout confirmation.
- Pooled balance rebalance (Postgres-first, then cache cutover).
- `balances.update` / `target_balance` / `set_usage` / `alterGrantedBalance`.
- Loose-entitlement expiry, rollover expiry.
- Entity create/delete.
- License assignment.
- Manual grants / adjustments.
- Lock finalize / release / expiry.
- Auto top-up completing (a grant, not a usage).
- Pending migrations applied on read.

Today most of these write Postgres, then bump `subjectViewEpoch` and invalidate Redis. Usage that landed in Redis between the PG write and the flush is the race in `balance-sync-correctness.md`.

---

## 3. The question is not "Redis vs a stream"

It is three different questions that get collapsed into one sentence.

**Q1. Durability SoT.** If this process dies and Redis is empty, what do we replay to get remaining back?

**Q2. Apply SoT.** Who decides, synchronously, that this track is allowed, which buckets it hits, and what remaining the caller sees?

**Q3. Analytics SoT.** What does Tinybird / `events.list` / `events.aggregate` query?

Today: Q1 is "hope the snapshot flush happened" (broken). Q2 is Redis Lua. Q3 is a best-effort EventInsert written *after* Q2.

"Event stream as source of truth" only answers Q1 if the stream contains the right kind of event. It does not automatically answer Q2. Check's hydration budget is 2s and the SLO is ~50ms. Check does not read Tinybird. Check cannot wait for a Kafka consumer to catch up and then read Postgres.

So the sketch "stream → Tinybird, and also balance workers that hold a snapshot and write Postgres eventually" is directionally right for Q1 + Q3. It is incomplete for Q2 unless the worker *is* the apply engine the API talks to, or Redis remains the apply engine and the stream is only the durable log.

---

## 4. Intents are not facts

This is the load-bearing distinction.

**Intent** (today's `EventInsert` / track body):

```text
customer C used 5 of feature messages at T, properties {...}, idempotency K
```

**Fact / allocation** (today's `MutationLogItem`):

```text
rollover ro_1 −3, customer_entitlement ce_2 −2, usage_window uw_9 +5
```

Allocation is a function of:

- current remaining per bucket
- current grant graph (which ents exist, entity vs customer, pooled)
- current catalog (credit schema, event_names, AI markups)
- `now` (window bounds, expiry, lazy reset)
- overage behaviour, spend limits, locks

Two concurrent "used 5" intents against the same customer are **not commutative**. Replay of intents is not deterministic unless you also freeze the catalog, the clock, and the exact prior snapshot, and serialize them through one writer.

That is why Orb can make raw usage events the SoT for *invoices* (query-time pricing over an immutable log) and still keep a **separate append-only credit ledger** for prepaid blocks. Metronome-style event billing is a meter. Autumn `overage_behavior: reject`, locks, prepaid, rollovers, and check+track are a **wallet**. We are both.

Tinybird already stores intents *plus* a lossy projection of facts (`deductions` JSON). That is enough for analytics. It is not enough to rebuild remaining, because:

- resets, grants, attach, pool rebalances, admin updates are not on that log
- ingestion is best-effort
- ClickHouse/Tinybird cannot do "reject this request if remaining < N" at 50ms with transactional isolation
- `deductions` is computed *after* Lua; if Lua is gone and you only have intents, you must re-run the allocator

**If the stream is SoT for remaining, the stream must be a fact ledger (or intents that have already been applied by a single writer into facts).** Raw tracks cannot be the ledger.

---

## 5. Constraints that kill naive designs

### 5.1 Check/track with reject is a synchronous wallet operation

`runCheckV2` is a read of remaining. `send_event` / `lock` is the same Redis deduction as track. `overage_behavior: reject` must not apply writes if the allocator still has leftover.

Any design that is "API appends to Kafka, worker applies later, check reads Postgres" accepts overspend. That is fine for in-arrears usage billing. It is not fine for the product we already ship.

So apply must happen before the HTTP response, in a single-writer context for the contended keys.

### 5.2 Redis Lua is already a balance worker

Redis is single-threaded per hash slot. The script takes a routing key + epoch key + feature hashes (hash-tagged onto the customer). That *is* the actor model:

- one writer at a time for those keys
- snapshot in memory for the duration of the script
- compare-and-set via `subjectViewEpoch`
- no network round-trips mid-apply

"Balance workers hold a snapshot" is not a new invention. It is a proposal to move that actor out of Lua into a process we own. The reasons to do that are real (Lua + SQL + TS triples, allocated invoices after apply, multi-region lock finalize, 10k-entity customers). The reasons not to do it first are also real: we would be rebuilding placement, failover, snapshot checkpointing, and request/response over a queue, while the actual data-loss bug is "facts are not durable."

### 5.3 Credit systems couple features

A messages track can drain a credit-system parent. Partitioning workers by `customer_id + feature_id` is wrong. The lock scope is the **credit graph** (what `getRelevantFeatures` already computes). Customer-level serialization is correct and simple, and too coarse for hot customers. Feature-level serialization is fast and incorrect.

Today different features *can* Lua-concurrently if they do not share keys. A naive customer-sharded worker is *more* serial than Redis.

### 5.4 Structural mutations must share the log (or a fence)

If usage facts live on a stream and attach/reset/pool live only in Postgres, we have recreated the current race with extra hops. Either:

- every grant/reset/shape change is a fact on the same per-customer log, or
- usage apply and structural apply take the same customer fence (`withCustomerBalanceSyncLock` as designed), and the fence is held across "read snapshot → write both sides."

`subjectViewEpoch` is a Redis-only fence. A stream SoT would use the log offset (or a per-customer sequence) as the epoch.

### 5.5 Side effects are not foldable

Allocated invoices, auto top-up, webhooks, Tinybird, lock receipts. Replay of a fact log must not create a second Stripe invoice. Side effects need idempotency keys derived from `mutation_id` / event id, or they must themselves be facts ("invoice I created for ce X").

### 5.6 Three deduction engines already exist

Lua (`deductFromSubjectBalances`), SQL (`executePostgresDeductionV2` / `performDeduction.sql`), TypeScript (`deductFromCusEntsTypescript`). They already drift. Moving apply to workers without collapsing these is how we get a fourth engine.

### 5.7 Tinybird is the right analytics sink and the wrong wallet

Orb's own architecture (from their docs): Redis/MemoryDB counters for *alerts*; invoices always computed from the columnar event store; prepaid credits on a separate ledger with pending→committed because events arrive late. They do not reject an API call against Tinybird.

We already use Tinybird the way Orb uses the columnar store for analytics. Hourly MVs, `aggregate_deductions`, property grouping from raw JSON. Keep that. Do not point check at it.

### 5.8 Kafka is a fan-out log, not an event store

`kafkajs` is in `server/package.json` and unused. Kafka gives partition order, consumer groups, and Connect-into-Tinybird. It does not give per-aggregate CAS, snapshots, or "append this fact in the same atomic step as the Redis apply" unless we dual-write.

Atomic apply+append while Redis is the apply engine means **XADD inside the same Lua script** (Redis Streams), then a relay to Kafka/Tinybird. That is exactly the mutation-log plan. Worker-as-apply can append to Kafka first (or in a transaction with a local snapshot) and ack the API only after the log is durable.

---

## 6. Architectures that are actually in the running

### A. Persist facts, keep Redis as apply (evolution of `01_mutation_logs.md`)

```text
API ──► Lua apply + XADD facts ──► Redis Streams
                                      │
                                      ├─► PG workers (delta replay, not snapshot)
                                      ├─► relay ──► Tinybird / Kafka
                                      └─► rebuild Redis hashes on miss
```

- Q2 unchanged (Lua).
- Q1 becomes the fact stream.
- Q3 can eventually consume the same stream instead of a second best-effort EventInsert.
- Smallest change that fixes cache-eviction loss and snapshot-overwrite races.
- Redis remaining is a **projection** that happens to also be the apply snapshot.
- Does not remove Lua. Does not make "the event stream" the thing the API writes first.

This is the honest first step. It is also most of what "stream as SoT, workers write PG" needs, if we admit Redis *is* the worker.

### B. Customer-partitioned apply workers (the sketch, specified)

```text
API ──► command to owner(customer) ──► worker
                                         │
                                         ├─ load snapshot (memory / RocksDB / Redis)
                                         ├─ run ONE deduction engine (TS)
                                         ├─ append facts to log (fsync)
                                         ├─ update snapshot
                                         └─ ack remaining to API
                                              │
                                              ├─► Tinybird (intents + facts)
                                              └─► PG projection (eventually)
```

This is Kafka Streams / Orleans / TigerBeetle-shaped: single writer per aggregate, snapshot is derived, log is durable SoT.

Required to not fail:

- Partition key = credit graph, not feature, not "whatever is convenient."
- Commands (track, check+track, update, finalize lock) go to the owner. Reads (plain check) can hit a replica snapshot with explicit staleness.
- Snapshot checkpoint + log offset so failover is "load checkpoint, replay tail," not "scan Tinybird."
- Structural commands on the same owner (or a fence).
- Deduction engine is TS, Lua/SQL deleted or test-only.
- API waits on the worker. Not fire-and-forget.
- Hot customers (already `shouldWarmCache` for 10k+ entities) need snapshot sharding *inside* the customer without breaking credit-graph atomicity.

This is a platform. It is the right long-term shape if we want to stop being a Redis-Lua company. It is the wrong first project.

### C. Pure computed remaining (meter, not wallet)

```text
remaining(feature, window) = grants − Σ allocated usage
```

This is Orb invoices / Metronome billable metrics. It works when remaining is a *report*. It does not work when remaining is a *lock*.

We would still need a wallet for prepaid, reject, locks, spend limits, usage windows that are not the entitlement interval, and unlimited-as-counter. We would have two systems again.

Do not pick C as the SoT for check. We can still compute *analytics* remaining from facts for "where did the credits go."

### D. Intent log as SoT, deduction as a replayable projection

API writes intents. Workers re-run `prepareFeatureDeductionV2` + allocator on replay.

This only works if every intent carries:

- catalog version (credit schema, event_names, markups)
- subject-view sequence (exact grant graph)
- `usageWindowNow`
- overage behaviour, filters, lock id

And if replay is strictly single-writer. Feature updates that change credit cost mid-stream become "which version did this intent see?" We already fall back to cost 1 when cached schemas trail a feature update. That is unacceptable as a ledger rule.

Treat this as a non-goal. Intents are for analytics and support. Facts are for remaining.

### E. Split the product

- **Meter:** intent stream → Tinybird / Neon. No remaining. In-arrears only.
- **Wallet:** fact ledger + sync apply (Redis or workers) for prepaid, included, reject, locks, windows.

This is what Orb actually does (events vs credit ledger). It is also approximately what we do today, except the wallet's durability is Redis hashes.

The useful version of E is: stop asking Tinybird to be the wallet, and stop asking the wallet to be the only place a track exists. Unify *ingest* (one API) but keep two projections.

---

## 7. What a real SoT stream has to contain

If we want to rebuild a customer's remaining from the log, the log is a **customer ledger**, not `events.datasource`.

Minimum fact families:

| Family | Examples | Why |
| --- | --- | --- |
| Grant / shape | ent created, cancelled, allowance changed, entity attached, pool graph, `usage_allowed`, unlimited | Without this, usage facts have nowhere to land |
| Reset | balance restored, rollovers minted, `next_reset_at`, invoice-owned reset | Lazy reset is a write, not a read |
| Usage allocation | `MutationLogItem` + usage-window mutations | The actual remaining deltas |
| Adjustment | `balances.update`, admin grant, `target_balance`, `set_usage` | Already a first-class API |
| Expiry | loose ent, rollover | Changes deductible set |
| Lock | reserved / finalized / released / expired + provenance items | Reserve cannot be Redis-only |
| Idempotency | `mutation_id` / command id applied | Replay safety |

Each fact needs `mutation_id` (or command id), `org_id`, `env`, `internal_customer_id`, `subject_seq` (or stream offset), and enough identifiers to apply with SQL `jsonb_set` / `balance = balance + delta` — not Redis JSON paths. That shape is already in `01_mutation_logs.md` and `MutationLogItem`.

Intents can ride along (`event_id`, properties, `event_name`) so Tinybird does not need a second ingest. They must not be required to fold remaining.

Postgres `applied_balance_mutations` (or equivalent) is still required if more than one projector applies deltas. Per-mutation dedupe in the same transaction as the apply. Batch-level dedupe is not enough.

---

## 8. Where deduction should run

| Option | Sync reject | Engine count | Atomic log | Cost |
| --- | --- | --- | --- | --- |
| Lua apply, stream is facts | Yes, today | 3 (Lua/SQL/TS) | XADD in Lua | Lowest. Fixes durability. |
| TS worker apply, stream is facts | Yes, if API waits | 1 (if we delete the others) | Worker fsyncs log before ack | Highest. Removes Lua. |
| SQL apply as primary | Yes, slow | 1 | PG WAL is the log | Kills check SLO. Already the fallback. |
| Tinybird / Flink apply | No | 1 | n/a | Wrong isolation. |

Recommendation: **do not move apply until facts are durable and Postgres is a projector.** Then decide if Lua is still the bottleneck. The TypeScript allocator (`deductFromCusEntsTypescript` + `prepareFeatureDeductionV2`) is the seed of a single engine; it is not complete enough to replace Lua today (usage windows, spend limits, aggregated hashes, lock unwind live in Lua).

---

## 9. Postgres "eventually consistent" is not new

`syncItemV5` already is an eventually consistent projector. The bugs are the *kind* of projection:

- It copies a **later snapshot**, so a delayed job can overwrite a newer pooled grant.
- It **requires the Redis hashes to still exist**.
- It is not keyed by mutation id, so retry/replay is not a fold.

A worker that "holds a snapshot and writes Postgres" repeats this if the write is "here is remaining now." The PG write must be **apply these facts if not yet applied**, or a snapshot that is explicitly watermarked with `subject_seq` / stream id (the rolling-deploy bridge in the mutation-log plan).

Dashboard reads of remaining can stay on Postgres if we accept lag. Check cannot.

---

## 10. Tinybird's place in the end state

Keep Tinybird as a **projector of intents + allocation**, not as SoT.

Today we dual-write: in-process batch → HTTP ingest, and a separate SQS path to Neon. Both are after apply and can fail independently. The end state is one fact+intent stream, Tinybird and Neon as consumer groups.

Do not compute remaining in pipes. `aggregate_deductions` is the right query: "how much was allocated to which `balance_id`," which already depends on facts we emit at apply time.

If we ever want "rebuild remaining from Tinybird" as a disaster tool, we would still be missing grant/reset facts. That is a different datasource (or the ledger topic), not `events`.

---

## 11. Recommended sequence (not a rewrite)

This is ordered by risk, not by how close it is to the slide.

### Phase 1 — Fact log exists

Lua already produces `mutation_logs`. Persist them in the same script as the apply (`XADD` to a per-customer Redis Stream, as designed). Stop treating the FullSubject blob as the durability path.

Done when: delete Redis hashes, run the sync worker, Postgres still has the deduction.

### Phase 2 — Postgres is a fact projector

Replace snapshot flush with mutation replay + `applied_balance_mutations`. Keep the customer fence. Snapshot sync only as a watermarked bridge (`last_snapshot_stream_id`).

Done when: a delayed sync job cannot overwrite a pooled rebalance, and cache eviction does not drop usage.

### Phase 3 — Structural facts on the same customer log

Resets, attach grants, pool rebalance, admin updates emit facts (or go through the same fence and write a shape fact). `subjectViewEpoch` becomes "last applied `subject_seq`."

Done when: you can rebuild hashes from (checkpoint snapshot + fact tail) after a total Redis loss.

### Phase 4 — Unify analytics ingest

Relay the same log to Tinybird / Neon. `EventBatchingManager` becomes a consumer. Intents are fields on the usage fact (or a paired intent record with the same id).

Done when: we do not have a third write path that can lose events the wallet committed.

### Phase 5 — Optional: move apply out of Lua

Only if Phase 3 works and Lua/SQL/TS drift is costing more than a worker platform. One TS engine. Worker owns the snapshot. Redis becomes a cache of the worker snapshot, or goes away for remaining. API is request/response to the owner.

This is the user's sketch. It is phase 5, not phase 1.

---

## 12. What I would not do

- Make Tinybird the SoT for remaining.
- Make raw track events the SoT and re-run deduction on every consumer.
- Fire-and-forget tracks into a stream and read remaining from Postgres on check.
- Replace Lua before facts are durable.
- Partition workers by feature without a credit-graph lock.
- Snapshot-flush Postgres from worker memory (same bug, new process).
- Forget that reset/attach/pool are writers.
- Keep three allocators while adding a fourth.

---

## 13. Open questions that actually matter

1. **How stale may plain check be?** If "a few hundred ms behind the apply worker" is OK, reads can be replica snapshots. If check must see the track that just landed on another node, check is a command to the owner.
2. **Is Redis allowed to remain the apply engine indefinitely?** If yes, Phases 1–4 deliver "stream as durability SoT" without a worker rewrite. If the goal is "no Redis for remaining," Phase 5 is in scope and should be costed as a platform.
3. **One log or two?** Wallet facts (this doc) vs meter intents (Tinybird). One stream with two record types is operationally simpler. Two streams need a join key (`event_id`) and will drift.
4. **Hot customer shape.** Do we shard snapshot state by entity *inside* a customer while keeping credit-graph apply atomic? Today's stale-while-revalidate for high-cardinality customers is a hint this will dominate worker design.
5. **Multi-region.** Lock finalize (us-east API) vs expire (us-west worker) already races. A stream does not remove that; it moves it to "which region owns the customer partition."
6. **Paid allocated / invoices.** Those are not remaining math. They have to sit *after* a committed fact, with their own idempotency, or stay sync-in-request with rollback of the fact (today's rollback path).

---

## 14. Worker death and replay

Yes. If the stream is the durability SoT, a dead worker is not an incident. It is "load a snapshot, fold the tail, resume." The snapshot can live in Postgres. The trap is *what* you fold, and *from which starting remaining*.

### 14.1 The only replay formula that works

```text
snapshot(S)  +  fold(facts where subject_seq > S)  =  remaining
```

`S` is a watermark: a stream offset, Redis Stream ID, or per-customer `subject_seq`. The snapshot and `S` must be captured together. A remaining vector without a watermark is not a snapshot. It is a rumor.

You almost never replay from customer creation on the hot path. Genesis replay is for audit, backfill, and "we lost every snapshot." Live failover is checkpoint + tail. That is how Kafka Streams state stores, event-sourced aggregates, and TigerBeetle accounts work: the log is SoT, the in-memory map is a cache of the fold.

### 14.2 What "fold" means

Folding a **fact** is addition:

```text
ce_2.balance += -2
ro_1.balance += -3
uw_9.usage   +=  5
```

No sort order. No credit schema. No `now`. No Lua. Two workers folding the same fact tail from the same `snapshot(S)` get the same remaining. That is why the stream must be a fact ledger.

Folding an **intent** ("used 5 messages") is re-running `prepareFeatureDeductionV2` + the allocator against whatever snapshot you just loaded. That is a different customer if:

- a reset happened between intents
- attach/cancel changed the grant graph
- credit costs or AI markups changed
- a lock was finalized
- Postgres remaining already includes some of those tracks

So: worker dies → replay **facts**. Do not replay today's `events` table through the deduction engine.

### 14.3 What Postgres is allowed to be

"Replay from the stream and maybe Postgres" is correct if Postgres is one of these, and only these:

**A. Watermarked snapshot store (the practical one).**

Postgres already has the grant graph (`customer_entitlements`, products, rollovers, usage windows). Give that row set a `subject_seq` (or `last_applied_stream_id`) meaning "this remaining already includes every fact `<= S`."

Recovery:

1. New worker takes ownership of the customer.
2. Read Postgres structure + remaining where `subject_seq = S`.
3. Read stream `(S, tip]`.
4. Fold those facts into the snapshot in memory.
5. Resume apply. New facts append at `tip+1`.

This is the "maybe Postgres." It is not "Postgres is also SoT." It is "Postgres is the cheapest place we already store a checkpoint." The projector that keeps Postgres current (Phase 2) *is* the checkpoint writer. Worker failover and dashboard freshness become the same job.

**B. Structure only, remaining only on the stream.**

Postgres has which ents exist, allowances, intervals. Remaining starts at zero / grant facts. The stream has every usage, reset, and adjustment fact from genesis (or from the last stream-compacted snapshot). Recovery does not read Postgres remaining at all. Useful if we do not trust PG remaining. More stream retention.

**C. Not this: current Postgres remaining + replay all events.**

That double-applies every fact the snapshot flush already absorbed, and then applies intents the flush never saw, through an allocator that sees *today's* grant graph. This is the current `syncItemV5` bug rotated 90 degrees.

Today's Postgres remaining cannot be `snapshot(S)` because it has no `S`. That is the whole point of the mutation-log watermark.

### 14.4 What must already be on the stream before this works

A worker that dies after a month of tracks cannot rebuild from Tinybird `events` + current `customer_entitlements`. Missing:

- grant/shape facts (attach created `ce_9` last Tuesday)
- reset facts (cron restored balance and minted rollovers)
- admin / `set_usage` / `target_balance`
- lock reserve/finalize
- usage-window counter mutations
- the watermark

Until Phase 3, "replay the event stream" is not an operation we can run. Until Phase 1, the stream does not even have facts.

### 14.5 Crash points (the worker is a state machine)

Assume the apply path is: validate → append facts → ack API → fold into memory → (async) checkpoint Postgres.

| Die after… | What is true | Recovery |
| --- | --- | --- |
| Validate, before append | Stream unchanged. Client will retry. | Nothing to replay. Idempotency on command id if the retry races a new owner. |
| Append, before API ack | Fact is SoT. Client may retry. | New worker folds the fact. Retry is a no-op via `mutation_id` / command id. |
| Ack, before memory fold | Same as above. | Fold from watermark. |
| Memory fold, before PG checkpoint | Worker snapshot was ahead of Postgres. | New worker: `snapshot(S_pg)` + tail, which includes the fact. Postgres catches up as projector. |
| PG checkpoint, stream truncated too early | Cannot rebuild. | Retention must outlive the oldest snapshot we are willing to recover from. |

The ordering that makes death boring: **the fact hits the log before we tell the caller it happened.** Memory and Postgres are allowed to lag the log. The log is not allowed to lag memory. That is the opposite of today (Lua mutates hashes, then we hope a sync job copies them).

If we keep Redis Lua as the apply engine, the equivalent is: Lua `XADD` facts in the same script as the hash writes (or XADD first, hashes as a projection). Worker death and Redis flush are the same recovery path: `snapshot(S) + tail`.

### 14.6 You do not rebuild Tinybird to recover a worker

Tinybird is a projector of intents + allocation for analytics. Worker recovery reads the **ledger topic** (or Redis Stream) and a watermarked snapshot. If those are gone, Tinybird cannot substitute: different schema, missing shape facts, eventual ingest, no `subject_seq`.

### 14.7 How long is the tail

Hot customer, 1k tracks/s, facts of a few hundred bytes: a 10-minute tail is cheap. A 90-day genesis replay is not a failover strategy. So:

- Checkpoint remaining + structure every N seconds or every M facts (Postgres or a compacted snapshot topic).
- Keep the fact log at least as long as `checkpoint_interval + projector_lag + ops_reaction`.
- Offload older facts to object storage for audit, not for failover.

This is why Phase 2 (Postgres as fact projector with a watermark) is the recovery mechanism, not a dashboard convenience.

### 14.8 Worked example

Customer has `ce_messages = 100`. Worker has applied facts 1..40. Postgres projector is at 37. Stream tip is 40.

Worker dies.

1. New owner reads Postgres: remaining 100 + deltas(1..37), `S = 37`.
2. Reads facts 38, 39, 40. Folds. Memory now matches what the dead worker had.
3. Track arrives. Allocator runs against that snapshot, appends fact 41, acks.

If we had instead loaded Postgres remaining and replayed the original 40 *tracks* through Lua, we would re-allocate 38–40 against a graph that already included 1–37, and we would re-allocate 1–37 that Postgres already had. Remaining would be wrong in both directions.

---

## 15. Better fit for this stack: wallet WAL, not worker-served remaining

If the requirements are **high track QPS** and **real-time remaining on our infra** (check, check+track, `customers.get` balances), I would not put a balance worker on the read/write path.

I would keep Redis as the serving layer and make a **fact WAL** the durability SoT. Recovery is still `snapshot(S) + tail`. The "worker" is Redis Lua, which we already run. Postgres and Tinybird stay projectors.

```text
check / track / lock
        │
        ▼
Redis Lua          apply + XADD facts in one script
        │
        ├── hashes ──► real-time reads (existing replica pool)
        │
        └── fact WAL (Redis Streams, relayed to Kafka/Redpanda if we want)
                ├──► Postgres projector   dashboard, billing, snapshot(S)
                └──► Tinybird / Neon      analytics
```

That is how a database is built: pages for reads, WAL for durability, replicas for QPS. We already have the pages and the replica reads. We are missing the WAL.

### 15.1 Why this matches the two constraints

**Real-time reads.** `getCachedFullSubject`, partial subjects, and `getCachedFeatureBalances` already go through `useReadPool: true`. Check's SLO is ~50ms and it fail-opens when Redis is down. A worker that *owns* remaining forces every check onto sticky routing, a warm snapshot, and a process hop. Kafka Streams interactive queries and "ask the customer partition owner" are the slow way to serve a point read we already serve from a Redis replica.

**High throughput.** Lua on a cluster slot is a good apply engine for this shape: no extra network mid-apply, pipelined hash reads, different credit graphs can proceed on different key sets. A customer-partitioned worker serializes *all* of that customer's features, including ones that do not share a credit graph, and adds enqueue + ownership + cold-start. Streams are excellent at *fan-out* of facts after apply (Tinybird, PG, webhooks). They are a bad place to *serve* remaining.

**Replay.** Identical to the worker-death story. Redis evicted or a node died: load watermarked Postgres remaining at `S`, fold WAL `(S, tip]`, write hashes, resume. We do not need a new actor to get that.

### 15.2 What I would not use this constraint set to justify

| Approach | Why it loses here |
| --- | --- |
| Balance workers serve check/track | Extra hop, coarser serialization, cold-start replay on the SLO path |
| Tinybird / CH as remaining | OLAP, no reject isolation, ingest lag |
| Postgres as apply | Already the fallback. Kills the 50ms path. |
| Intent stream as SoT | Replay is the allocator, not addition |
| TigerBeetle / new ledger DB | Simple transfers, not a waterfall allocator. New infra, same apply problem in front of it |

Workers are still the right *projector* (the thing that folds facts into Postgres). They should not be the thing the API calls for remaining.

### 15.3 When I *would* move apply off Redis

Only if Redis itself is the problem: Lua/SQL/TS drift, multi-region lock owners, 10k-entity subject blobs, cost. That is a serving-layer rewrite. It is not required for "we need a log we can replay" or for Tinybird to stop being a second write path.

If we do it later, I would still keep a Redis (or similar) **read cache** in front of the worker. High QPS real-time reads and single-writer apply want different hardware. We already split that (write on primary, read on replica pool). A worker that is both is a regression.

### 15.4 What this changes vs today's mental model

Say "the WAL is the SoT, Redis remaining is a serving projection we apply into synchronously." Do not say "the event stream is the SoT, and we read remaining from it."

We never serve remaining from the stream, same way Postgres does not answer `SELECT` by scanning `pg_wal`. The stream exists so Redis can die.

The existing mutation-log plan is this architecture. The missing pieces are: `XADD` in Lua, stop snapshot-flushing Postgres, watermark PG remaining, relay the same WAL to Tinybird, emit grant/reset facts onto it.

---

## 16. Bottom line

The instinct is right: **remaining should be a fold of a durable log; Redis/Postgres/Tinybird should be projections; apply should be a single writer that holds a snapshot.** Worker death (or Redis death) is `snapshot(S) + fold(facts after S)`, and Postgres is a good place to keep `snapshot(S)` once it has a watermark.

For *this* stack — high track QPS plus 50ms remaining reads — I would not introduce balance workers on the request path. I would add a **fact WAL behind the Redis we already serve from**. Redis Lua stays the apply engine and the real-time read layer. The WAL is what we replay. Postgres and Tinybird consume it.

The first-idea version is wrong in three places:

1. It treats today's track events as that log. They are intents. Remaining needs facts, and also grant/reset/shape facts we do not emit. Replay is addition of deltas, not re-running deduction.
2. It puts Tinybird on the SoT path. Tinybird is a projector. Worker recovery does not read it.
3. It under-specifies apply. Check/reject/lock cannot wait on an eventually consistent worker unless that worker *is* the synchronous owner of the customer — and even then, that is the wrong serving layer for our read SLO.

We already have the allocator, the mutation receipt shape, the subject epoch fence, the replica read pool, and a written plan to stream those receipts. The missing piece is the WAL, not a new fleet of snapshot owners.
