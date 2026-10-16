# Balance history: every change to a balance, and why

2026-10-06 · og/balance-history-prd · 3937394617

A customer opens a feature's balance in the dashboard and sees each change: when, why, by how much, who asked, and what was left after.
The worker already logs every balance command, and `plans/balance-log-summary.md` puts the before and after on each record. This PRD reads them: a track that records a usage event stays in `events` and carries its "after"; a track that records none, and every other command, lands in `balance_history`. Eventless tracks are rare: fan-out is at most 0.16% of live events (11k of 6.9M an hour), so the table takes tens of thousands of track rows an hour at most. Everything here builds against the fixtures the producer PRD's task 1 defines and ships behind a flag until the worker stamps summaries.

## Context

### the mutation log as a ledger
[packages/balance-engine/src/models/mutation/ · apps/balance-worker/src/processor/actions/ensureSubjectCurrent/advanceResets.ts · server/src/internal/balances/track/balanceWorker/ · apps/herald/tests/unit/consumers/usageEvents/record-to-usage-event.test.ts]

- customerA on pro (500 messages), tracks 30
  - what's in `changes` vs `result.deltas` vs `summary`? which does a reader trust for what was left? → rowIncrement · deductionDelta
- customerA's cycle ended yesterday; a track arrives today
  - how many records land, in what order, and which timestamp does the reset carry?    → advanceResets · cycleEndedAt vs occurredAt
- event `api_call` fans out to 3 features; another track sends `skip_event`
  - how many records, and which of them carry a usage event?                            → balanceWorkerTrackRequest · usageEvent null
- customerA is evicted (Postgres mode), rehydrated, tracks again
  - what revision does the next record carry? what still orders it after the first?    → keepSubjectBaseline · position
- pro → premium deletes the messages row and inserts another
  - what ties the two rows to one feature for a reader with no rows of its own?        → summary · subject

related: usage events, balance webhooks and auto top-ups are consumer groups on this same log; history is one more, with its own place in it.

### the balance the customer sees
[shared/api/customers/cusFeatures/utils/getApiBalanceV2.ts · vite/src/views/customers2/components/table/customer-balance/ · plans/balance-log-summary.md]

- customerA has 3 products granting 100 messages each, tracks 50
  - what do granted / remaining / usage show, and how many breakdown items?             → getApiBalanceBreakdownItemV2
- entity e1 tracks 10 on a per-entity feature, then 10 on a customer-level one
  - which views move in each case, and what does e1's sheet show for the second?        → summary views · command_entity_id
- action1 costs 0.2 credits; customerA tracks 100 action1
  - under which feature's history does the entry sit?                                   → fundingFeatureId

related: the producer PRD's version of this topic is prerequisite reading; here the questions are only about which view a row belongs to.

### herald's consumers
[apps/herald/src/consumers/usageEvents/ · apps/herald/src/stream/landRecords/ · apps/herald/src/stream/seedGroupPlaces.ts · packages/postgres/src/eventsDb/ · server/tinybird/datasources/events.datasource]

- a 500-record slice lands in Postgres; Tinybird fails after 200 rows
  - which rows are marked sent? what does the retry send?                                → markSentToTinybird · writtenRows
- herald crashes after Tinybird took the slice but before the mark
  - how many copies does Tinybird hold, and what does `events.list` do about them?       → MergeTree · listEventsPaginated
- one record in the slice throws inside the job, not the store
  - what happens to the other 499? to that one?                                           → landRecords halving · herald_record_skipped
- a new consumer group joins a log holding three months of records
  - where does it start, and what would make it start earlier?                            → seedGroupPlaces
- a usage event the caller named vs one the worker named
  - what's the row id in each case? can the two be ordered against each other?            → positionToUsageEventId

related: Postgres is the ledger and Tinybird follows it; a store failure waits in place, and only the job's own bug skips a record.

### writes the worker never sees
[server/src/internal/balances/utils/deductionV2/ · server/src/internal/billing/v2/execute/executeAutumnActions/ · server/src/internal/migrations/v2/batchOperations/ · server/src/external/stripe/webhookHandlers/handleInvoiceCreated/ · plans/balance-worker-rollout/overview.md]

- dashboard clicks recalculate on customerA; then `balances.update` sets `expires_at`
  - worker command or Postgres write, in each case?                                       → recalculateBalance.ts:23 · updateBalanceParamsToCommand
- a version migration replaces messages 500 → 1000 across 2,000 customers
  - what writes the rows, and what does the worker hold for those customers afterwards?    → applyReplacePatches · evict
- a Postgres-lane deduction fails halfway and rolls back
  - which rows does the rollback touch? does the worker learn?                            → rollbackDeductionV2
- Stripe sends `invoice.created` for a prepaid price
  - what does the handler write on the row?                                               → handlePrepaidPrices
- entity e1 is deleted while on pro
  - which rows change, through which path?                                                → delete-entity.test
- customerA's org is outside the rollout gate
  - where does a track go, and what does the log hold for them?                           → resolveBalanceWorkerRouting

related: the rollout plan's gate table is this same list; until a path moves onto the worker, history shows its write as an external change dated to the gap between two records.

## Plan

```
Balance history
- data model  → balance_history table · log position and remaining-after on events
- API shapes  → the history entry, the list params
- herald      → the track after on usage events
- herald      → the balance-history consumer, chain check in-stream
- API         → list history for a balance
- dashboard   → history sheet on the balance row, behind a flag
```

**not doing**
- rows for records without a summary (no feature key without one, and nothing backfills them later)
- reconciliation and the lag alert (follows the Redis cut-over)
- an external change that spans a consumer restart (the first record per view after a restart has nothing to compare to)
- history before the consumer first runs (a new group starts at the log's end)
- customers on the Redis path (the sheet says so and links their event logs)
- checks (they move nothing)
- reverting or editing from history
- the public OpenAPI contract for the endpoint (after the shape has been used)

### 1 · [ ] data model → balance_history table · log position and remaining-after on events

**goal** — one row per view a non-track command or an eventless track moved, keyed by its place on the log; a usage event the worker wrote says where it sits on the log, which feature it drew from and what was left, in Postgres and Tinybird alike
**steps** — `balance_history` beside `eventsNeon` in the Neon schema file, pushed with `db:events:push` · an eventsDb repo that inserts and skips by id, as usage events do · five nullable columns on `eventColumns` (so `EventInsert` carries them), on `events.datasource`, and in `usageEventToTinybirdRow`; rows from before the columns read as null in all three stores, and `events_by_timestamp_mv` is untouched · the new table in `validateDbSchema`'s skip list
**verify** — bun ts · cd shared && bun db:generate (one migration: five nullable columns on `events`) · cd shared && bun db:events:push:dev · bun tb deploy:check · cd packages/postgres && bun test · cd apps/herald && bun test tests/unit/consumers/usageEvents · manual: `events.list` on dev still returns rows written before the columns existed

**shape**
```
balance_history   id = <topic>:<partition>:<offset>:<feature_id>:<view entity_id | ->
  org_id · env · internal_customer_id · internal_entity_id · feature_id · command_entity_id
  log_partition · log_offset · occurred_at · effective_at · type · command_id · request_id
  before jsonb · after jsonb · rows jsonb · details jsonb · actor jsonb (not null)
  external change: type external_change · id = <position>:<feature_id>:<view entity_id | ->:external · before = last after seen · after = this record's before
  index (internal_customer_id, internal_entity_id, feature_id, occurred_at desc, log_offset desc)
events  + log_partition int · log_offset bigint · balance_feature_id text · remaining_after numeric · entity_remaining_after numeric
```

**scenarios** — a record lands as history rows
- pro → premium replaces messages and seats
- entity e1 upgrades on a per-entity feature
- e1 tracks 10 with `skip_event` on a customer-level feature
- a view whose before isn't the last after seen
- an `applyBillingPlan` whose summary breaks on messages and seats

**scenarios** — a usage event the worker wrote lands in Postgres and Tinybird
- customerA tracks 30 messages
- the caller named the event with `x-event-id`
- a track on the Redis path, written by the server
- the same event ingested into Tinybird twice, crash before the mark

### 2 · [ ] API shapes → the history entry, the list params

**goal** — pin `ApiBalanceHistoryEntry` and `ListBalanceHistoryParams` in `shared/api` before herald or the endpoint produce them; one entry shape whether the line came from `events` or `balance_history`
**steps** — params extend `ListPageRequestSchema`: `customer_id` and `feature_id` required, `entity_id` optional, `custom_range` as `events.list` has it, `tracks` = buckets or lines · entry = when, why, who, how much, what was left, breakdown · `why` as a discriminated union: every command type, a track bucket, an external change · the track arm carries `value` and `deductions` as `events.list` does, no `rows` · `action` on the plan-change arm and `actor` required (the producer stamps both before any summary) · the page via `createListPageResponseSchema`, plus `engine`: whether the customer is routed and when its history starts · exported from `shared/api/balances/index.ts`, nothing in `packages/openapi`
**verify** — bun ts · cd shared && bun test (one parse fixture per `why` arm, one track entry built from an `events` row, one bucket) · manual: fields only the dashboard reads (log position) marked `internal: true`

**shape**
```
ApiBalanceHistoryEntry { id · occurred_at · effective_at · feature_id · entity_id · command_entity_id
  why:   { type: "track", value, event_id, properties, deductions }
       | { type: "track_bucket", count, total_value, from, to }                 tracks between two other entries, within one UTC day
       | { type: "plan_change", action, from_plan_ids, to_plan_ids }
       | { type: "external_change", from, to }                                 the gap between two records
       | { type: "reset" | "update" | "delete" | "recalculate" | "finalize" | "initialize", … }
  actor: { type: AuthType | "lock_sweep" | "expiry_timer" | "reset_cron" | "reset" | "migration_run" | "auto_topup" | "unknown", id, name }
  before · after: { granted, remaining, usage } | null · rows: [{ id, plan_id, before, after }] | null }
ListBalanceHistoryParams   = ListPageRequestSchema + { customer_id!, feature_id!, custom_range?, tracks?: "buckets" | "lines" }   lines needs custom_range
ListBalanceHistoryResponse = page + engine: { routed: boolean, history_since: number | null }
```

**scenarios** — one entry: which `why` arm, and what it carries
- customerA tracks 30 messages, event recorded
- e1 tracks 10 with `skip_event` on a customer-level feature
- `api_call` fans out to messages and credits
- action1 funded by credits
- a lazy reset ahead of a track
- lock 8 then finalize at 5
- lock released on expiry by the timer
- pro → premium mid-cycle
- `billing.update` quantity 10 → 15
- a manual top-up of 100 credits
- an auto top-up at threshold
- `balances.delete` on the only row
- recalculate from the dashboard
- a version migration moved the row outside the worker
- entity e1 deleted while on pro
- 4,000 tracks between a reset and an upgrade

**scenarios** — a list request
- `tracks: "lines"` with the custom_range of one bucket
- `tracks: "lines"` without custom_range
- feature_id of a credit-funded feature (action1)
- entity_id without customer_id

### 3 · [ ] herald → the track after on usage events

**goal** — a worker-written usage event carries the funding feature, its remaining after in the customer view and the entity view, and its log position; a record without a summary still makes its event, with the position and no remaining
**steps** — `recordToUsageEvent` reads `position`, `result.fundingFeatureId` and `summary` · customer view = the summary entry for the funding feature with entityId null, entity view = the entry for the command's entity when there is one · `log_partition` and `log_offset` from `position` · `usageEventToTinybirdRow` passes all five through · fixtures from the producer PRD's builder
**verify** — cd apps/herald && bun test tests/unit/consumers/usageEvents · cd packages/tinybird && bun test · manual: on dev, one worker track shows the five columns in Neon and in Tinybird

**scenarios** — a track record becomes an event row
- customerA tracks 30 messages, summary on the record
- e1 tracks 10 on a per-entity feature
- e1 tracks 10 on a customer-level feature
- action1 funded by credits
- `api_call` fans out to messages and credits
- lock 8 on messages, then finalize at 5
- a track rejected for insufficient balance
- a track that funds nothing, applied with no deductions

### 4 · [ ] herald → the balance-history consumer, chain check in-stream

**goal** — write a row per view for non-track records and eventless tracks that carry a summary; hold the last "after" per view in memory and compare every record's "before" to it; a mismatch writes an external-change row (before = the last after seen, after = this record's before, dated to the gap between the two records); skip the first record per view after a restart, and every record without a summary
**steps** — a consumer folder beside `usageEvents` and one line in `heraldConsumers` · per record: no summary, skip · per view: compare, maybe an external row, then a row unless the track recorded an event, then remember the after · `occurred_at` is the record's time; a reset view also carries `effective_at` = its `cycleEndedAt` · memory keyed by partition, applied only after the slice lands, cleared when the stream assigns or revokes the partition, skips a record, or drops a stale slice (the stream tells the job; offsets alone can't, transaction markers leave holes) · one LRU across partitions bounded by bytes (64 MB a process), an evicted view seeding like a first record · store errors thrown, as the stream's contract wants
**verify** — bun ts · cd apps/herald && bun test tests/unit/consumers/balanceHistory · cd apps/herald && bun test tests/unit/stream · manual: on dev, upgrade a customer twice with tracks between, read the table in order

**shape**
```
createBalanceHistoryConsumer({ ctx: { eventsDb, logger } }) → StreamConsumer "balance-history" + onPartitionsReset({ partitions })
  memory: LRU<viewKey, { partition, after, occurredAt }> bounded by bytes     viewKey = org · env · customer · entity-or-null · feature
  slice → per record: summary ?? skip → per view: compare → external row? → history row unless track-with-event → stage after
        → rows landed → staged afters applied
```

**scenarios** — a slice of records lands, per view
- a track with an event, a `skip_event` track, then a plan change
- an `applyBillingPlan` whose summary breaks on messages and seats
- the first record for a view after herald restarts
- a `<cmd>:reset` record, then the track that triggered it
- `balances.delete` leaves after null, then free → pro arrives with before null
- a row deleted outside the worker, then the next track
- an evict, a rehydrate, then a track
- the same view touched twice in one slice
- two transactions back to back, offsets 10 and 12
- a slice replayed after a crash before its offsets committed
- a partition moves to another herald and comes back
- a record herald could not parse sits in the middle of the slice
- a view evicted from a full map, then its next record
- the events database refuses connections for a minute
- Postgres refuses one row (a 23xxx), the rest of the slice is fine

### 5 · [ ] API → list history for a balance

**goal** — paginated history per customer, entity and feature on a time cursor, log position breaking ties; tracks between two other entries come back as buckets aggregated in Tinybird (count, total value, remaining after at the bucket's end, deduped by id), a bucket never spanning more than a UTC day, and as raw lines only for a bounded custom_range; the page says whether the customer is routed and when its history starts
**steps** — `balances.list_history` on the RPC router with `Scopes.Balances.Read`, not in `packages/openapi` · history rows from Neon, limit + 1, newest first from the cursor · every gap between rows cut at UTC day boundaries, one Tinybird call for all the pieces on the page, tracks filtered by `balance_feature_id`, the leading gap closed at the cursor or now · interleave rows and non-empty buckets; a page ends on a row or a day edge, never inside a bucket · `engine.routed` from `resolveBalanceWorkerRouting`; `history_since` = the oldest positioned event or history row for the customer, null when none · `tracks: "lines"` reads `list_events_paginated` with the new columns over the range, deduped by id · dev without the Neon URL reads the main database, as the event writer does
**verify** — bun ts · cd server && bun test tests/unit/balances/history · bun t balances/history · manual: the dashboard's customer page hits the route with a session cookie

**shape**
```
balancesRpcRouter.post("/balances.list_history", ...handleListBalanceHistory)
listBalanceHistory({ ctx, params }) → rows (neon, ≤ cursor, limit + 1) → gaps cut at UTC days → trackBuckets pipe (boundaries[]) → interleave → page + engine
pipe balance_history_track_buckets: per piece (from, to]: count · sum(value) · argMax(remaining_after, (timestamp, log_offset)) · inner LIMIT 1 BY id
cursor = defineCursor({ t: occurred_at, p: log_partition, o: log_offset })
```

**scenarios** — a page is assembled
- a reset, 4,000 tracks, an upgrade, 200 tracks, all in one day
- tracks newer than the newest history row
- tracks only, no history rows, over 90 days
- the page boundary lands on a day edge inside a run of tracks
- a run of tracks crossing midnight UTC
- two commands at the same millisecond
- a lazy reset whose `effective_at` is a week before its `occurred_at`
- credits, for a customer whose action1 tracks fund it
- an external change between two records
- the same event twice in Tinybird
- `tracks: "lines"` over one bucket's range
- `tracks: "lines"` over a range holding a plan change
- custom_range with nothing in it
- a customer still on the Redis path
- a customer routed yesterday, with older tracks only in `events`

### 6 · [ ] dashboard → history sheet on the balance row, behind a flag

**goal** — open a balance in `customers2` and read its history newest first, a bucket expanding into its tracks; the row action and the sheet exist only while the org flag is on, after the worker stamps summaries; a customer not on the worker sees where their history would start, with a link to their event logs
**steps** — `balanceHistoryOrgIds` on the admin-upserted flag config (`server/src/internal/misc/featureFlags/`, served by `GET /organization/flags`, defaulted in `useFeatureFlags`), an allowlist like `disableOverageBillingFlags` · `"balance-history"` in `SheetType`, mounted in `CustomerSheets`, opened from a `CustomerBalanceTableColumns` action with `{ featureId, featureName }` like check-balance · `useBalanceHistory` on `useInfiniteQuery` + `useQueryKeyFactory`, keyed by customer, entity, feature; `useBalanceHistoryLines` for one bucket's range · a virtualized list as `LogsList` does, one row component per `why` arm, a bucket row that expands · `engine.routed` false shows "history starts when this customer moves to the new balance engine" and links the customer's event logs; `history_since` renders above the oldest entry · entity from `useCustomerContext`
**verify** — cd vite && bun ts · cd vite && bun lint · manual: flag off, no action and no sheet; flag on, open a balance with a reset, an upgrade and tracks, expand a bucket, scroll back a page

**shape**
```
useBalanceHistory({ customerId, entityId, featureId }) → { entries, engine, hasNextPage, fetchNextPage, isLoading }      /v1/balances.list_history
useBalanceHistoryLines({ customerId, entityId, featureId, range }) → { lines, isLoading }                                tracks: "lines"
BalanceHistorySheet → BalanceHistoryList → BalanceHistoryRow | BalanceHistoryBucketRow (expands into lines) · BalanceHistoryStart
```

**scenarios** — the sheet opens on a balance
- flag off
- flag on, a feature with a reset, an upgrade and tracks between
- a bucket of 4,000 tracks, expanded
- tracks only, day after day, scrolled back three months
- an entity selected, a customer-level feature
- an external change between two entries
- a lazy reset shown by its `effective_at`
- a plan change, hovering the actor
- a customer with no history yet
- a customer still on the Redis path
- a customer routed yesterday, with older tracks only in `events`
- the request fails

## Open

- ? retention job on Neon `events` (none found; sizing follows the track rate)
- ? `skip_event: true` share, from the request-log archive and the express dataset (fan-out is counted above)
