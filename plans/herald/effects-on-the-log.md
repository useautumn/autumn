---
author: john + claude
feature: herald
date: 2026-09-24
status: implemented, integration runs pending
---

# Effects on the log

`after.state` is the whole subject on every record: 3 KB for a small customer, 28 KB at 60
balances, 570 KB when a row carries a 5000-entity map. It is serialized and gzipped on the
partition thread before the caller is answered, and only herald's webhooks job reads it, to
rebuild the subject and decide two things: which webhooks to send and, soon, which auto
top-ups to run. The worker holds the before-state, the after-state and the mutation's own
catalog when it decides, so it decides those too, and the record carries the decisions.

```
worker   decide ─▶ applyMutation ─▶ decideEffects(before, after) ─▶ record { changes, effects }
herald   for effect of record.effects: balance_webhook → svix · auto_topup → sqs
```

A record is then: `command` (why), `changes` (what moved, replayed), `result` (verdict), and
`effects` (what must happen elsewhere because of it, never replayed). About 1.4 KB whatever
the customer holds.

Rejected: a read set (`before`, the subject narrowed to the touched features) still ships rows
and grows with products; herald as a stateful follower needs a base state, and the Postgres
backend lags the log; a claim check moves the bytes and adds a wait. Decided 2026-09-24:
alert and top-up policy runs in the worker; a future cache-push job reads the worker's
`readSubjectState`, not the log.

## The shape

One flat list, discriminated on `type`, like `changes` on `table` and `command` on `type`.
Members are loose, like `command` and `result`: a newer field never breaks an older reader.

```ts
type BalanceWebhookEffect = { type: "balance_webhook"; eventType: string; data: unknown; tags: string[]; idempotencyKey?: string };
type AutoTopupEffect      = { type: "auto_topup"; featureId: string; reason: "balance_below_threshold" | "threshold_settlement" };
type MutationEffect       = BalanceWebhookEffect | AutoTopupEffect;

record.effects?: MutationEffect[]     // on the log only: the store's copy never carries it, like `after` before it
```

A webhook effect is the Svix message; the app it goes to is resolved by the host from
`command.org.svix`, as today. An auto top-up effect names the feature; the job payload is
`identity` plus that, and the job re-reads the customer. The engine owns the types because
it owns the record; `@autumn/balance-webhooks` returns `BalanceWebhookEffect` directly and
`BalanceWebhook` goes.

Extending it: a new field on a kind is free; a new kind is one union member and one herald
consumer, readers deployed before writers, the rule the log already has for a new command
type; a new command that should notify calls `decideEffects` from its decide.

## Units

| # | unit | test |
|---|---|---|
| 1 ✅ | **The record carries effects; herald delivers them.** Engine: `models/mutation/mutationEffect.ts`, `effects` on the record, dropped by the store beside `after`. `@autumn/balance-webhooks` returns `BalanceWebhookEffect`. Herald: the webhooks consumer sends `record.effects` when present, else rebuilds from `after.state` as today; `consumers/autoTopups/` dispatches `auto_topup` effects through `dispatchAutoTopup` with `getSqsJobs()` and `getMiscCache()`. Deployable alone. | engine: record parses with and without effects, JSON round trip; herald unit: a record with effects sends them and skips the rebuild, one without rebuilds; auto-topup consumer claims the key then enqueues, `pending_exists` enqueues nothing |
| 2 ✅ | **The worker decides effects.** `processor/actions/decideEffects.ts`: `subjectsToBalanceWebhooks` and `subjectToAutoTopupTriggers` over before and after, in `decideTrack` and `decideFinalize` where `logsAfter: true` sits. `MutationResult.write.effects` replaces `logsAfter`; `mutationOf` stamps effects, never `after`. Reset and plan stop stamping anything. | `track/limit-reached/*`, `track/usage-alerts/*`, `lock/finalize-lock-usage-alert`, `auto-topup-basic`, `-concurrent`, `-credit-systems` on the worker path; the record-size script shows ~1.4 KB at 60 balances |
| 3 ✅ | **Retire the rebuild.** Not in production yet, so no rotation to wait for: `after` off the schema; herald loses `recordToSubjects`, `readRecordCatalog`, the catalog cache and its invalidation consumer; `revertChanges`, `subjectStateToLogState` and `HERALD_DATABASE_URL` deleted; `@autumn/balance-webhooks` keeps only the subject-to-webhook half. | herald, webhooks and engine unit suites; `bun ts` on each |

Open: `decideEffects` runs inside the writer's critical section, CPU only. If it shows in the
partition's decide time, `PendingMutation` keeps the before-state and `mutationOf` computes
effects at commit instead; the record does not change.
