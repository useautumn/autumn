# Units of work

| # | unit | ends with this passing |
|---|---|---|
| 1 ✅ | **The package, bound to the server.** `packages/auto-topup`: `trigger/` (predicate + threshold billing over the subject view with `now`, `subjectToAutoTopupTriggers`), `dispatch/` (`dispatchAutoTopup`, producer contract). Server: `triggerAutoTopUp` takes the `fullSubject` its callers already hold and becomes triggers → dispatch over a `workflows`-backed producer; `triggerAutoTopUpsOnEnabled` becomes a dispatch; `setupAutoTopupContext`, `setupThresholdBillingContext`, `clearThresholdPastDue` import the package; `enqueueAutoTopupWithBurstSuppression` and the moved files are deleted. | package unit tests (moved predicate suites + dispatch outcomes) green; server unit suite at baseline; `auto-topup-lock-retry-suppression` green with its mocks repointed; `auto-topup-trigger` + `auto-topup-credit-systems` green on the legacy path (`bun tw … --balance-worker=false`). |
| 2 ✅ | **A worker-path check dispatches.** Server: after `runBalanceWorkerCheck`, when the reply carries state and catalog, `subjectStateToFullSubject` → triggers → dispatch, fire-and-forget as `getCheckDataV2` does. | integration: `auto-topup-trigger` 1 (plain check below threshold) green on the worker path; a second check inside the pending window does not enqueue. |
| 3 | **Herald dispatches off the log.** `auto_topups` logged (decision 2); herald `consumers/autoTopups/`: track/finalize records with an after-state → `subjectStateToFullSubject` → triggers → dispatch, with the misc cache and an SQS producer (`AUTO_TOPUP_QUEUE_URL`). | package unit: a subject landing below threshold yields one trigger, above yields none, an entity subject resolves the customer config; herald unit: dispatch claims the key then enqueues, `pending_exists` enqueues nothing; integration: `auto-topup-basic`, `-concurrent`, `-credit-systems` green on the worker path. |

Unit 2 also closed the job side on the worker path: `getBillableFullCustomer` flushes the worker and reads Postgres, and the job evicts the customer after every successful top-up (the eviction plan's unit 2 generalises this to every bypassing plan).

Order: 1 → 2 → 3. Unit 3 is the first non-server SQS producer; if that is refused, herald posts to an
internal server route and reuses the server's producer.
