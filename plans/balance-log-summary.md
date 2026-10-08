# Balance log summary: what every record says about the balance it moved

2026-10-06 · og/balance-history-prd · 3937394617

Every balance command the worker applies lands on the log as a record: the command, the row ops, the result. None of them says what a feature's balance was before or after, which plan change it was, or who asked.
This PRD puts those three on the record. `plans/balance-history.md` reads them; it builds against the fixtures task 1 defines and stays dark in prod until task 3 ships.
Task 3 lands after task 2, never before: the reader skips any record without a summary, so the first record that carries one must already carry its intent and actor too, and the reader can treat both as required.

## Context

### the mutation log as a ledger
[packages/balance-engine/src/models/mutation/ · apps/balance-worker/src/processor/writer/actions/decide.ts · apps/balance-worker/src/processor/actions/ensureSubjectCurrent/advanceResets.ts · server/src/internal/balances/track/balanceWorker/]

- customerA on pro (500 messages), tracks 30
  - what's in `changes` vs `result.deltas`? which of them says what was left?          → rowIncrement · deductionDelta
- the same track is resent under the same command id, then under a new one
  - what lands on the log the second time? what does the writer compare?               → receipt · commandToFingerprint
- customerA's cycle ended yesterday; a track arrives today
  - how many records land, in what order, and which timestamp does the reset carry?    → advanceResets · cycleEndedAt vs occurredAt
- event `api_call` fans out to 3 features; another track sends `skip_event`
  - how many records, and which of them carry a usage event?                            → balanceWorkerTrackRequest · usageEvent null
- a decision replaces customerA's projection
  - what does the writer hand `onStateAdvanced`, and what may run inside it?            → decide.ts:101 · synchronous section
- pro → premium deletes the messages row and inserts another
  - with only `changes` in hand, how is the deleted row's feature found?               → from state · internal_feature_id

related: usage events, balance webhooks and auto top-ups all read this same log; the summary is for one more reader, `plans/balance-history.md`.

### the balance the customer sees
[shared/api/customers/cusFeatures/utils/getApiBalanceV2.ts · packages/balance-engine/src/apiRenderer/balances/ · packages/balance-engine/src/deduction/setup/resolveRowBounds.ts · tests/integration/balances/update/balance/update-balance-breakdown.test.ts]

- customerA has 3 products granting 100 messages each, tracks 50
  - what do granted / remaining / usage show, how many breakdown items, which row paid? → getApiBalanceBreakdownItemV2 · draw order
- entity e1 tracks 10 on a per-entity feature, then 10 on a customer-level one
  - which column moves in each case? what does e1's balance read vs the customer's?     → isPerEntityMapRow · entityKey
- action1 costs 0.2 credits; customerA (credits 200) tracks 100 action1
  - whose balance renders the change, and what does `balances.action1` show?            → fundingFeatureId · check-with-lock-credit-system
- premium active, pro scheduled next to it
  - which rows count in the feature total?                                               → orgToInStatuses · fullSubjectToCustomerEntitlements

related: the worker renders off its own rows through the same function (workerStateToApiBalance), so a summary stamped on the record is what `customers.get` would have returned at that instant.

### plan changes on the worker
[server/src/internal/balanceWorker/billingPlan/ · tests/integration/billing/attach/immediate-switch/immediate-switch-basic/ · tests/integration/billing/attach/params/carry-over-usages/ · tests/integration/billing/attach/scheduled-switch/scheduled-switch-basic/]

- pro (500 messages, 30 used) → premium (1000) mid-cycle
  - which ops does the plan become? does the 30 survive, and on which row?              → autumnBillingPlanToPlanOps · reset rules
- same upgrade with `carry_over_usages`, usage 50 against a new allowance of 30
  - what does the inserted row hold? how does `carry_over_balances` differ?             → carry-over-usage-basic · carry-over-balance-basic
- premium → pro scheduled, `reset_usage_when_enabled: false`
  - does usage reset at the switch? when is the worker command sent?                    → scheduled-switch-basic 5a
- prepaid quantity 10 → 15 billing units
  - which op carries the +60: a replaced row or an increment?                            → entitlements-balance.test
- any of the above
  - what does the command say about which plans were involved, or why?                  → applyBillingPlanCommand (nothing today)

related: attach, updateSubscription, setPlans and migrations all end as one AutumnBillingPlan, so one `applyBillingPlan` is the only shape a plan change has on the log.

### the request behind a command
[server/src/internal/balances/balanceWorker/requestContextToCommandBase.ts · server/src/honoUtils/HonoEnv.ts · server/src/internal/balances/lockSweep/actions/confirmExpiredLocks.ts · server/src/internal/balances/autoTopUp/ · server/src/internal/billing/v2/execute/executeAutumnBillingPlan/writePlanRows/ · server/src/internal/migrations/v2/actions/migrationItem/]

- a secret key tracks 30; a dashboard user clicks recalculate; Stripe's `invoice.created` attaches a plan
  - what does ctx hold for each (authType, apiKeyId, userId, impersonatedBy)? what reaches the command today? → AuthType · requestContextToCommandBase
- the lock sweep confirms an expired lock; the EventBridge timer releases one; the auto top-up job buys 100 credits at threshold
  - which request id and identity does each command carry? is there a caller at all?    → confirmExpiredLocks · expireLock · autoTopUp
- `billing.attach`, a quantity update, a scheduled downgrade firing, a cancel
  - at the point the rows are written, what still knows which action built the plan?    → writeCustomerRowsThroughWorker · AutumnBillingPlan
- a version migration moves customerA through the per-customer lane
  - what links that customer's `applyBillingPlan` back to the migration run?            → withMigrationItemTracking

related: the command base is built in one place from the request context, so what the command says about its caller is decided once for every route.

## Plan

```
Balance log summary
- record   → the per-view summary on every record (schema only)
- server   → why and who on every command
- worker   → stamp the summary (gated on the load run)
```

**not doing**
- stamping before the load run passes (every track pays for it on the one thread)
- a summary for checks (they move nothing)
- an entity view of a customer-level row (same numbers as the customer's; the command's entity is named instead)
- writes outside the worker (`plans/balance-history.md` says what history does without them)

### 1 · [x] record → the per-view summary on every record (schema only)

**goal** — a record can say, per feature view it moved, granted / remaining / usage before and after; optional, so every record on the log today still parses
**steps** — `summary` on the mutation record · one entry per (feature, entity-or-null) view · totals as `getApiBalanceV2` reports them · per-row before/after on every command but track · a fixture builder that stamps it the way the worker will
**verify** — bun ts · cd packages/balance-engine && bun test tests/unit/models · manual: a record read off the staging log parses with no summary

**shape**
```
summary?: Array<{
  featureId: string
  entityId: string | null
  before: { granted; remaining; usage } | null
  after:  { granted; remaining; usage } | null
  rows?:  Array<{ id; planId; before: { remaining; usage } | null; after: { remaining; usage } | null }>
}>
```

**scenarios** — one record: which views, and what's in each
- customerA tracks 30 messages, one row · customer view only, no rows
- the same track with `skip_event` · same summary, no usage event on the record
- `api_call` fans out to messages and credits · two records, only the first carries the event, both carry a summary
- entity e1 tracks 10 on a per-entity feature · customer view and e1 view
- entity e1 tracks 10 on a customer-level feature · customer view only, e1 named as the command's entity
- action1 funded by credits · the credits view, never action1
- a track that draws 60 from a pooled balance · the feature's view, pooled row among its rows
- cycle ended yesterday, track today · a `<cmd>:reset` record before the track, each with its own summary
- lock 8 on messages, then finalize at 5 · two records, the finalize's view moves +3
- lock expires with `release` · a finalize at 0, view moves +8
- lock expires with `confirm` · `confirmExpiredLock`, nothing moves, no summary
- pro → premium replaces the messages row, 30 used · one view, before and after set, two rows
- free → pro inserts messages · before null
- `balances.delete` on the only messages row · after null
- cancel removes the last contribution to a pool · the pool's feature view, after null
- `applyBillingPlan` touching messages and seats · two views
- reset refills messages with a rollover of 20 · one view, rollover folded in like the API
- evict · no summary
- a record written before the field existed · summary absent, still parses

### 2 · [ ] server → why and who on every command

**goal** — `applyBillingPlan` says what the change was and which plans; every command says who asked, a person or a system (lock sweep, expiry timer, Stripe webhook, reset cron, migration run, auto top-up job); both required on the record from the first stamped one, so task 3 waits on this
**steps** — two releases, because the request parsers and command schemas are strict and a worker only goes live on the manual blue/green swap: (a) engine and worker accept optional `actor` and `intent`, shipped and swapped live; (b) the server sends them, behind a flag or in a later release · `requestContextToCommandBase` fills `actor` from ctx: `authType`, `apiKeyId`, `userId`, `impersonatedBy` · every system path names itself where it builds its command: the lock sweep, the expiry timer, the Stripe webhook middlewares, the reset cron, the migration lane, the auto top-up job · `intent` on `applyBillingPlan`: action, from and to plan ids, the migration id when there is one; attach's action from its `AttachBranch`, the rest from the route that built the plan, set beside the plan in `writeCustomerRowsThroughWorker` · the worker's lazy reset carries `{ type: "reset" }` with the triggering request id in its details · the log is safe either way: records parse their command loose and replay applies only `changes`
**verify** — bun ts · cd packages/balance-engine && bun test tests/unit/models (a command with the fields, one without, a record with them parsed by the loose log schema) · cd server && UNIT_TESTS=1 bun test tests/unit/balanceWorker (the unit runner's env; bare `bun test` opens a Neon branch) · manual: (a) swapped live and a day of traffic before (b) is flagged on; one `billing.attach` on dev, read the command off the local log

**shape**
```
baseCommand         + actor:  { type: string, id?, name? }        known types, exported for producers: AuthType | "lock_sweep" | "expiry_timer" | "reset_cron" | "reset" | "migration_run" | "auto_topup"
applyBillingPlan    + intent: { action: string, fromPlanIds: string[], toPlanIds: string[], migrationId?: string }
                                known actions, exported for producers: "new" | "upgrade" | "downgrade" | "renew" | "add_on" | "one_off" | "new_version" | "scheduled_switch"
                                | "cancel" | "uncancel" | "quantity" | "manual_topup" | "auto_topup" | "set_plans" | "migration" | "sync" | "rollback" | "restore" | "license"
on the wire both are open strings: a label that is never replayed must not be able to reject a command, and a new kind must not need two releases; a reader maps an unknown value to a generic label
```

**scenarios** — the command that lands: its actor and its intent
- a secret key attaches pro to a free customer
- a dashboard user upgrades pro → premium mid-cycle
- a dashboard user, impersonating the org, upgrades
- a customer JWT tracks 30
- `billing.update` quantity 10 → 15
- `billing.update` manual top-up of 100 credits
- cancel at end of cycle, then the switch fires at cycle end
- cancel immediately, then uncancel
- scheduled downgrade premium → pro, firing at cycle end
- `setPlans` replacing two plans with one
- a version migration moves customerA through the per-customer lane
- the auto top-up job buys 100 credits at threshold
- Stripe `invoice.created` attaches a plan
- the reset cron resets messages
- a track triggers a lazy reset inside the worker
- the lock sweep confirms an expired lock; the expiry timer releases one
- a per-entity product attached to e1
- `carry_over_usages` on an upgrade
- a record written before the fields existed

**scenarios** — deploy order
- the server on (b) with the live worker still before (a)
- mid-swap: the standby on (a), the live fleet before it, the server sending
- the worker rolled back to before (a) after the server started sending
- a log replay of records carrying the fields, on a worker from before (a)
- a checkpoint holding such records, loaded by a worker from before (a)

### 3 · [ ] worker → stamp the summary

**goal** — the worker fills `summary` from the states on either side of a decision; it ships only when a load run at 4x the measured prod track rate holds µs/track within 10% of baseline on typical (≤ ~990µs) and 15% on heavy, because every track pays for it on the one thread and a slower worker churns ownership
**steps** — stamping behind a flag, off by default: turning it off is the rollback · stamp only once task 1's accept release is live on herald and on both worker fleets, because the metering topic decodes records with the strict record schema and a reader before it skips a stamped record, losing its usage event, webhook and auto top-up · once stamped records sit within the log's retention, no reader rolls back below task 1 · touched views from `changes` only, a deleted row's feature resolved through `from` · render each view from `from` and `to` in `onStateAdvanced` · the summary joins `effects` on the log copy only; the store, receipts and checkpoints keep dropping both · `benchmark:track` before and after, typical and heavy
**verify** — cd apps/balance-worker && bun benchmark:track --scenario=typical · bun benchmark:track --scenario=heavy · cd apps/balance-worker && bun test · manual: task 1 live on herald and both fleets before the flag goes on · ≤ 990µs typical, ≤ 2,750µs heavy, at ~1,500 tracks/s per worker

**scenarios** — one decision: how many views rendered
- typical track, 2 plans × 6 features · one view, two renders
- entity track on a per-entity feature · two views, four renders
- `applyBillingPlan` replacing 12 features · twelve views
- heavy, 4 plans × 15 features, upgrade · the cost ceiling
- `balances.delete` on a row · feature found in `from`, not in `to`

**scenarios** — deploy order
- herald on the build before task 1 reads a stamped record
- the flag turned off with stamped records still on the log

## Open

- none
