---
author: john + claude
feature: packages/auto-topup
date: 2026-09-24
status: draft, not yet approved
---

# `@autumn/auto-topup`: the dispatch side of auto top-ups

The job that charges and grants stays in the server (`autoTopup.ts`, `settleThresholdCharge`). This
package owns everything that decides a job should run and hands it to a queue, so the server and
herald run the same code. Two gaps drive it: nothing on the worker path decides that a balance fell
below its threshold, and the decision today is spread over four server files that herald cannot import.

## Today

```
legacy track / check / finalize ─► triggerAutoTopUp(newFullCus, feature)
                                      feature + credit systems it funds
                                      fullCustomerToAutoTopupObjects · resolveThresholdSettlement
                                      enqueueAutoTopupWithBurstSuppression ─► claimAutoTopupPendingKey (@autumn/cache)
                                                                            ─► workflows.triggerAutoTopUp (SQS)
customers.update (enable)        ─► triggerAutoTopUpsOnEnabled ─► enqueueAutoTopupWithBurstSuppression
worker track / check             ─► nothing
```

- The job re-derives every predicate output from a fresh customer read; the only input it needs is
  `{ orgId, env, customerId, featureId }`. The trigger-side predicate exists to avoid useless jobs, and
  the pending key (30s claim, 10 min hold on contention) is the burst gate both sides must share.
- The predicate files (`fullCustomerToAutoTopupObjects`, `resolveThresholdSettlement`,
  `computeThresholdCharge`, `priceThresholdBilling`, `isThresholdBillingPrice`) import only
  `@autumn/shared` and each other. `selectThresholdBlockedProducts` is job-side and stays.
- The worker's HTTP reply carries the full in-memory state (`auto_topups` included) plus the catalog;
  the log record does not: `customer.auto_topups` is in `customerRenderedColumns` and stripped by
  `subjectStateToLogState`. Plan-level `product.auto_topups` reaches herald through the catalog.
- Herald has no SQS producer; `@aws-sdk/client-sqs` is server-only. Herald now has the misc cache.
- `redis_unavailable` failure webhooks are sent from the trigger side and need svix + a FullCustomer.

## The unit

**One dispatch: a subject and a feature in, a queued job out.** The subject is the worker's view
(`subjectStateToFullSubject`), which every host already has: the legacy paths hold a `fullSubject`
before they convert it to `FullCustomer`, a worker reply carries state + catalog, and a log record
carries the after-state. Nothing is converted for the predicate's sake.

```
packages/auto-topup/src/
  autoTopup.ts                          entry
  trigger/                              pure: does this feature call for a job, and why
    subjectToAutoTopupTriggers.ts         ({ fullSubject, featureId, now }) → AutoTopupTrigger[]
                                          tracked feature + credit systems it funds; each: below threshold | settle
    subjectToAutoTopupObjects.ts          today's fullCustomerToAutoTopupObjects over the subject view
    thresholdBilling/                     resolveThresholdSettlement · computeThresholdCharge
                                          priceThresholdBilling · isThresholdBillingPrice
    types/autoTopupTrigger.ts             { featureId, reason: "balance_below_threshold" | "threshold_settlement", autoTopupConfig? }
  dispatch/                             effect: gate, then send
    dispatchAutoTopup.ts                  ({ ctx: { miscCache, logger, producer }, payload }) → DispatchResult
                                          claimAutoTopupPendingKey (@autumn/cache) → producer.enqueue(payload)
    types/autoTopupDispatch.ts            AutoTopupJobPayload { orgId, env, customerId, featureId }
                                          AutoTopupProducer { enqueue(payload): Promise<void> }
                                          DispatchResult = enqueued | pending_exists | redis_unavailable
```

The subject view is the structural minimum both `FullSubject` and `WorkerFullSubject` satisfy, the way
`fullSubjectToCustomerEntitlements` and `resolveBillingControlWithProduct` are already typed; `now`
is the request's or the record's `occurredAt`, never `Date.now()` inside the package.

Hosts bind the two injected things:

```
server   producer = workflows.triggerAutoTopUp        herald   producer = SQS SendMessage, AUTO_TOPUP_QUEUE_URL
         subject = request fullSubject / check reply           subject = subjectStateToFullSubject(record.after, catalog)
         failure webhook on redis_unavailable (svix)           log and move on
```

Why this is the unit and not "the predicate in shared": shared says what an object *is*; this package
says when Autumn *acts* on it. `triggerAutoTopUpsOnEnabled` proves the split: it has no predicate, only
a dispatch. Burst suppression stays in `@autumn/cache` (the job side keeps/clears the same key); the
package calls it, it does not re-own it.

## Dispatch points, after

| path | subject | who dispatches |
|---|---|---|
| legacy track / check / finalize | the request's `fullSubject` | server `triggerAutoTopUp` = triggers → dispatch |
| customers.update enable | none | server `triggerAutoTopUpsOnEnabled` = dispatch |
| worker check (no record) | `subjectStateToFullSubject(reply.state, reply.catalog)` | server, after `runBalanceWorkerCheck` |
| worker track, sync / async / batch / finalize | `subjectStateToFullSubject(record.after.state, catalog)` | herald `consumers/autoTopups/` |

A sync worker track is seen by herald only; the server does not dispatch on its reply. That keeps one
dispatch point per kind of event, and the shared pending key covers the overlap if a later change adds one.

## Decisions

| # | question | recommendation |
|---|---|---|
| 1 | Predicate input type | The subject view from unit 1, with `now` passed in. No `FullCustomer` in the package and no `WorkerFullSubject → FullCustomer` adapter. The job side keeps reading `FullCustomer` through `fullSubjectToFullCustomer` as today. |
| 2 | Herald cannot see `customer.auto_topups` | Log it: move `auto_topups` out of `customerRenderedColumns`. It is a column a decision now reads, which is the stated rule for that list. Alternative (herald reads the customer row from Postgres per candidate) adds a read per below-threshold record. |
| 3 | Herald's producer | `@aws-sdk/client-sqs` in herald, one `createSqsAutoTopupProducer({ queueUrl, region })` in `apps/herald/src/setup/`; the message body is the server's `{ id, name: "auto-top-up", data }` shape. A send failure is logged and the record skipped; the next track retries. |
| 4 | Which feature a record touched | `record.command.featureId` for track and finalize records; the trigger expands it to the credit systems it funds. No record helpers in the package. |
| 5 | Server forwards | None. Callers import `@autumn/auto-topup`; the old files are deleted (cloud does not import them). |
| 6 | `redis_unavailable` webhook | Stays in the server's trigger callers; the package returns the reason and the host decides. Herald logs. |

## Units

See `units.md`.
