---
author: john + claude
feature: customer-cache
date: 2026-09-29
status: draft-for-review
---

# Evictions: making every change reach the cache

## The problem

Herald's cache-push only sees the metering log. Many writes for worker-routed customers go
straight to Postgres and signal the worker only with an evict, which is never logged
(`evictCommand.ts:5` "never on the log, since no balance moves"). So herald misses them:

| direct Postgres write, then evict | cite |
|---|---|
| cron batch resets on the SQL lane (the default) | `runResetLoopV2.ts:53-58`, `invalidateResetCaches.ts:58` |
| Stripe invoice handlers writing entitlements | `processConsumablePricesForInvoiceCreated.ts:500-509` |
| entity updates (controls, usage windows) | `updateEntity.ts:86-104` |
| rewards, trials, one-off expiry, seat sync, migrations | `grantRewardEntitlements.ts:140`, `processExpiredTrialRow.ts:115`, … |
| paid-allocated fallback, legacy `/customers/:id/balances` | `withPaidAllocatedFallback.ts:65,70`, `handleUpdateBalancesV2.ts:40` |

Evicts arrive two ways, both ending in `processor.evict` (`processor/commands/evict.ts:14-20`):
sync HTTP (most) and queued on the command topic (batch paths). Both always name the
customer (`entityId: null`).

## Facts the design rests on

- **The log offset is the only per-customer number that survives an evict.** Revision resets
  to 0 on every hydration (`keepSubjectBaseline.ts:22-24`); nothing persists it in prod.
- **A customer reload is O(1) in entities.** The customer-part SQL never reads entity-owned
  rows (`subjectRowsSql.ts:25-28`); entity parts load lazily per entity.
- **Log parsing is strict.** An unknown `command.type` parks a worker partition on followers
  and old tasks (`createMeteringRecordHandler.ts:255-284`) and is dropped by herald. Past
  command types shipped schema and emitter together; the written rule is readers first
  (`plans/herald/effects-on-the-log.md:52-53`), and rolling and blue/green deploys make it
  matter (`plans/balance-worker-handoff.md:100-102`).
- **The committer writes every change back to Postgres** (`runFlush.ts:201-222`); a record with
  `changes: []` lands only its bookmark (`landFlush.ts:84-92`).
- **No herald job reacts to a record without `effects`** except cache-push
  (`recordToUsageEvent.ts:30-70`, `subjectsToBalanceWebhooks.ts:32-33`,
  `recordToAutoTopupPayloads.ts:15-25`).

## Design: the evict is logged

```
direct Postgres write → evict (HTTP or queued)
  worker processor.evict: wait for its own store writes, drop memory,
    append an "evict" MutationRecord: changes [], no effects
  herald cache-push sees it like any record → re-reads the customer
    → worker hydrates from Postgres → fresh customer entry
```

- **One mechanism, no new topic.** The existing `EvictCommand` joins the logged command union;
  it gains a `commandId`. Its result is `{ type: "evict" }`.
- **Log-only by construction.** `changes: []`, so the committer lands only the bookmark and
  replay has nothing to apply; a replaying follower drops the customer, as the owner did.
- **Revision.** The record is stamped `before → before + 1` against the resident state (or
  `0 → 1` when not resident); the next hydration starts from 0 as today. *(Open: confirm the
  refinement at `subjectStateMutation.ts:89` and sqlite `applyMutation` accept this.)*
- **Every sender stays unchanged.** Both evict paths already meet in `processor.evict`.

## Entities: customer generation, checked by the SDK

An entity entry holds `entities.get`, which includes customer rows, so a customer-level change
stales every entity entry. Re-pushing them grows with entity count, so herald never does.

- The customer entry carries `generation`: the log offset of the customer's latest evict record.
- Every entity entry carries the `generation` it was built under.
- The SDK reads both keys in parallel; an entity entry whose generation is below the
  customer's is ignored, and the check goes to the API.

*(Open: herald must know a customer's current generation when writing an entity entry. Either
the worker returns it in `readSubjectState`, which needs the evict record's offset surfaced
through `CommittedMutation`, or herald reads the customer entry from the KV first.)*

## Rollout (readers first)

1. **Deploy A, readers only.** `evict` in the logged union and result union; sqlite
   `applyMutation` drops the customer on it; herald rebuilt, with tests that an evict record
   makes no usage event, webhook or top-up, and does trigger a cache push.
2. **Wait** until no task older than A can read the log: rolling deploy done, idle blue fleet
   and herald rollback slot on A or stopped.
3. **Deploy B, the emitter, behind a switch** (default off). Rolling back B is safe; never
   roll back below A while evict records are in retention.
4. No `schemaVersion` bump anywhere: any older reader treats it as fatal (`topicEnvelope.ts:31-38`).

## Units

| # | unit | test |
|---|---|---|
| 1 | Logged evict, readers only (deploy A): schemas, sqlite replay, herald tests | engine unit tests; herald: evict record → cache push only |
| 2 | Emitter behind a switch (deploy B): `processor.evict` appends the record | worker unit: evict appends one empty record after the store wait; integration: Stripe invoice write → cache entry refreshed |
| 3 | Generation on entries + SDK check | byoc unit; herald entity entry carries the customer generation |

## Open decisions

1. Revision stamping for the evict record (above).
2. Where herald gets the customer generation for entity entries (above).
3. Switch mechanism for the emitter: a constant or an edge config.
4. Metering topic retention in prod, which bounds how long "never roll back below A" holds.
