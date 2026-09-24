# Balance worker: paid allocated v1 track

## What is missing

A v1 allocated item (continuous feature + in-arrear prorated price) invoices on every
track that crosses its included usage. The worker path deducts the row and stops: no
invoice, no replaceables. `llocated` appears in the worker stack only in
`resolveRowBounds.ts`, which decides overage, not billing.

## Precedent: legacy already refuses and defers, twice

```
track                                   balances.update usage / remaining
  executeRedisDeductionV2                 executeRedisDeductionV2
    paidAllocatedV1 -> PaidAllocated        paidAllocatedV1 -> PaidAllocated
  handleRedisTrackErrorV3                 handleUpdateBalanceDeductionErrorV2
    shouldFallback -> runPostgresTrackV3    shouldFallback -> executePostgresDeductionV2
      executePostgresDeductionV2
        withLock(lock:deduction:<org>:<env>:<customer>, 60s)
        deduct_from_cus_ents, overage "reject"
        createAllocatedInvoice per updated paid allocated row
        fireTrackWebhooks, triggerAutoTopUp, cache sync
```

`paidAllocatedV1` = a selected row whose feature is continuous (`isAllocatedFeature`)
and whose customer price is `isAllocatedPrice` (`cusEntToCusPrice`,
`BillingType.InArrearProrated`). Free allocated rows and v2 allocated prices are not.

## Design

Legacy spells the same fallback twice (`handleRedisTrackErrorV3`,
`handleUpdateBalanceDeductionErrorV2`). The worker path gets it once, beside
`withCreateIfMissing`; each call site supplies only its Postgres step, as a closure
over the fresh rows. Nothing in `allocatedInvoice/` or `deductionV2/` changes.

```
server/src/internal/balanceWorker/subject/withPaidAllocatedFallback.ts
  worker(); on the paid allocated refusal:
    evict -> getFullSubject(primary) -> postgres({ fullSubject }) -> evict

track     postgres: runPostgresTrackV3 for this feature
update    postgres: executePostgresDeductionV2 with the update's options   (later)
```

### Per feature, never per body

The worker tracks a body one feature at a time (`trackEachFeature`), so by the time
feature X refuses, earlier features may already be applied on the worker. The
fallback therefore wraps the per-feature call, and the Postgres step deducts feature
X alone. Each feature runs exactly once on exactly one engine.

```
trackEachFeature
  for each featureId:
    withPaidAllocatedFallback
      worker: client.track(command for featureId)            -> worker reply
      refused: evict, read, runPostgresTrackV3(featureId), evict
                                                             -> Postgres response
trackOutcomesToApiResponse
  merges worker replies and Postgres responses by featureId
```

Evict before makes the fresh read whole: the worker flushes lazily, and `evict`
returns once its copy is gone and its writes are in Postgres, including the features
applied earlier in this same loop. Evict after drops a copy rehydrated during the
write. A later feature in the loop then rehydrates from Postgres and sees X.

### Engine

`computeTrack` refuses after `deduct` (pure, no side effect) when any selected
customer entitlement is paid allocated v1. New reason `paid_allocated_not_supported`.
`check` keeps working: the guard is track-only. The predicate is engine-local,
composed from the shared parts over `WorkerFullCustomerEntitlementWithProduct`, which
already satisfies `CustomerEntitlementWithCustomerPrices`.

### Later call sites

`balances.update` usage and remaining move to the worker with the same wrapper and a
`postgres` closure around `executePostgresDeductionV2` with their existing options.

### Out of scope, decided later

- Queued track (async and batch): a refused queued command settles as "refused" in
  the worker consumer; by decision there is no Postgres fallback for it.
- `body.lock` on paid allocated: legacy throws "Locks are not supported for paid
  allocated features"; the fallback inherits that.
- v2 allocated: bills at cycle end, never invoices on track, unaffected.

## Units

Each is a thin end-to-end slice with a runnable test at the end.

1. [x] **Refuse and defer, single feature.** Engine reason, `isPaidAllocatedV1Deduction`,
   guard in `computeTrack`; `withPaidAllocatedFallback`; per-feature wrapping in
   `trackEachFeature`; reply merge.
   Tests: engine unit (paid refuses; free allocated, v2 allocated, metered do not;
   check still answers). Wrapper unit with mocked modules (refusal runs the lane as
   evict, read, postgres, evict; rethrows all else). Integration:
   `allocated-invoice/bill-immediate` cases 1 and 2 on the worker path.
2. [x] **Whole matrix green.** The seven `allocated-invoice/` suites plus
   `event-fan-out` (new fixture features `EventSeats` and `EventActions` sharing
   "seat-event"). Revealed: the worker view needs replaceables for v1 allocated
   balances; now read beside the state for continuous rows only. Harness fix:
   `ensureV2Features` clears the org cache once Redis is ready, since the insert's
   own clear no-ops before that.
3. [~] **Queued track.** Decided: no Postgres fallback. A queued paid allocated
   track settles as "refused" in the worker consumer; sync track is the supported path
   for v1 allocated.
4. **balances.update on the worker.** Separate plan; reuses the wrapper.

## Case matrix (unit 1 and 2 integration)

| Case | Expect |
|---|---|
| track within included usage | balance moves on Postgres, no invoice, worker copy evicted |
| track past included | invoice for the overage, Stripe sub unchanged |
| untrack below included | replaceables per on_decrease, no refund |
| second track after fallback | worker rehydrates from Postgres, sees the deduction |
| metered feature on the same customer | stays on the worker, no fallback |
| event_name fan-out: metered + paid allocated | metered on worker, allocated on Postgres, each once |
| paid allocated with `lock` | 4xx, same message as legacy |
