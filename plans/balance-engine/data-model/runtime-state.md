# The state one customer owns

## One customer is the ordering unit

```text
scenario   two entities each contribute 500 messages
action     entity A tracks 300 messages
expect     customer and an unassigned entity both read 700

┌──────────────────────────────────────────────────────────────┐
│ customer: pooled-track-shared                                │
│                                                              │
│  messages pool                                               │
│  500 from entity A + 500 from entity B = 1,000               │
│                              │                               │
│                    entity A tracks 300                       │
│                              ▼                               │
│  customer view · unassigned entity view = 700                │
└──────────────────────────────────────────────────────────────┘
```

That is the exercised contract: the pooled-balance test creates two `500` contributions, deducts `300` through one entity, then expects the customer and an unassigned entity to see the same `700` remaining. [track-pooled-balances.test.ts:24](../../../server/tests/integration/balances/track/pooled-balances/track-pooled-balances.test.ts#L24)

The current Redis keys encode the same boundary. Customer and entity views differ, but both the subject view and every shared feature balance use `{customerId}` as the hash tag. [buildFullSubjectKey.ts:1](../../../server/src/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.ts#L1) [buildSharedFullSubjectBalanceKey.ts:1](../../../server/src/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.ts#L1)

So the runtime owner is **one organization + environment + customer**. An entity selects a view inside that owner; it is not a separate ordering domain.

## What sits inside that root

```text
┌──────────────────────── customer runtime root ────────────────────────┐
│                                                                      │
│  IDENTITY + VIEW                                                     │
│  customer ids · optional entity ids · subject type · view epoch      │
│                                                                      │
│  CATALOG + STRUCTURE                                                 │
│  active products · feature kind/config · entitlement rules          │
│  prices · credit links · pooled links · billing controls             │
│                                                                      │
│  MUTABLE BALANCE BUCKETS                                             │
│  entitlement balance · adjustment · additional balance              │
│  entity sub-balances · rollovers · pooled synthetic entitlement      │
│  next reset · expiry                                                 │
│                                                                      │
│  CAPS + COUNTERS                                                     │
│  usage windows by feature + entity + property filter                 │
│  spend limits · max purchase · overage permission                    │
│                                                                      │
│  CORRECTNESS STATE                                                   │
│  bucket order · idempotency claims · lock receipts + exact deltas    │
└──────────────────────────────────────────────────────────────────────┘
```

This isn't a proposed schema. It is the existing `FullSubject` split into the parts that change a runtime answer. The current model carries customer/entity identity, a `subjectViewEpoch`, products, ordinary entitlements, pooled entitlements, and usage-window rows. [fullSubjectModel.ts:19](../../../shared/models/cusModels/fullSubject/fullSubjectModel.ts#L19)

The normalized model makes the split explicit: catalog arrays are shared reference data, while every metered `SubjectBalance` carries its entitlement, price, product options, quantity, scope, balance, reset metadata, entity map, and rollovers. [normalizedFullSubjectModel.ts:70](../../../shared/models/cusModels/fullSubject/normalizedFullSubjectModel.ts#L70) [normalizedFullSubjectModel.ts:145](../../../shared/models/cusModels/fullSubject/normalizedFullSubjectModel.ts#L145)

A pooled balance is one synthetic customer entitlement backed by one or more contribution rows. Its identity includes customer, feature, interval, reset mode, lifecycle link, and expiry; each source entitlement contributes a current and next-cycle grant. [pooledBalanceTable.ts:25](../../../shared/models/pooledBalanceModels/pooledBalanceTable.ts#L25) [pooledBalanceTable.ts:132](../../../shared/models/pooledBalanceModels/pooledBalanceTable.ts#L132)

## Why `balance` alone cannot answer a check

```text
┌──────────────────────┐       ┌────────────────────────┐
│ messages balance     │       │ five-unit usage window │
│ remaining: 97        │       │ used: 3 · headroom: 2  │
└──────────┬───────────┘       └────────────┬───────────┘
           └──────────────────┬─────────────┘
                              ▼
                    ┌────────────────────┐
                    │ required 2 → allow │
                    │ required 3 → deny  │
                    └────────────────────┘
```

The integration test leaves `97` balance but only `2` units of window headroom. A pure check for `2` passes, a check for `3` fails, and neither check consumes state. [usage-window-check.test.ts:30](../../../server/tests/integration/balances/usage-windows/usage-window-check.test.ts#L30)

That ordering is in the decision function: boolean and unlimited grants allow first; window headroom then gates the request; overage, spend, max-purchase, and included balance decide what remains. [apiBalanceToAllowed.ts:27](../../../shared/api/customers/cusFeatures/utils/convert/apiBalanceToAllowed.ts#L27)

Usage windows are separate mutable counters, keyed by customer, feature, optional entity, and property-filter identity. The row owns the current bounds and usage; the limit itself is resolved from configuration at decision time. [usageWindowTable.ts:16](../../../shared/models/cusProductModels/cusEntModels/usageWindowTable.ts#L16)

| Feature shape | Runtime meaning |
| --- | --- |
| boolean | grant exists |
| unlimited | always allowed |
| finite meter | buckets plus caps |
| credit member | cost-converted pool |

## A lock must remember where the reservation came from

```text
before                    reserve 8                    finalize actual 5

┌──────────────────┐      ┌──────────────────┐         ┌──────────────────┐
│ hourly       5   │      │ hourly       0   │         │ hourly       0   │
│ lifetime    20   │ ───► │ lifetime    17   │ ──────► │ lifetime    20   │
└──────────────────┘      │                  │         └──────────────────┘
                          │ receipt          │
                          │ hourly      -5   │  unwind 3 into the exact
                          │ lifetime    -3   │  lifetime bucket
                          └──────────────────┘
```

The lock test reserves `8` by draining hourly `5` then lifetime `3`. Finalizing at `5` restores only the lifetime `3`. [check-with-lock-refund-breakdown.test.ts:13](../../../server/tests/integration/balances/lock/basic/check-with-lock-refund-breakdown.test.ts#L13)

That is why correctness state includes more than a lock ID and total. A `LockReceipt` stores the exact mutation items, and each item names the entitlement or rollover plus its balance, adjustment, usage, value, entity, and credit-cost deltas. [fetchLockReceipt.ts:7](../../../server/src/internal/balances/utils/lock/fetchLockReceipt.ts#L7) [mutationLogItem.ts:9](../../../server/src/internal/balances/utils/types/mutationLogItem.ts#L9)

Body-level track idempotency is also state, but today's contract is only a claim: a successful retry receives `duplicate_idempotency_key`; this path does not replay a stored response. [track-body-idempotency.test.ts:1](../../../server/tests/integration/balances/track/idempotency/track-body-idempotency.test.ts#L1)

## Attach replaces bucket identity without losing live tracks

```text
setup                    compute                     concurrent track

┌─────────────────┐      ┌─────────────────┐         ┌─────────────────┐
│ Postgres A: 100 │      │ new grant: 200  │         │ live A: 95 → 90 │
│ live A:      95 │ ───► │ used on A:   5  │         └────────┬────────┘
└─────────────────┘      │ candidate B:195 │                  │
                         └────────┬────────┘                  │
                                  └─────────────┬──────────────┘
                                                ▼
                                      ┌──────────────────┐
                                      │ publish B: 190   │
                                      │ epoch: 2 → 3     │
                                      │ delete live A    │
                                      └──────────────────┘
```

Attach currently takes structure from Postgres but overlays the live mutable balance fields before compute. [overlayAttachRuntimeBalances.ts:21](../../../server/src/internal/billing/v2/actions/attach/setup/overlayAttachRuntimeBalances.ts#L21) The unit test turns live source `A = 95` and a new `200` grant into candidate `B = 195`. [overlay-attach-runtime-balances.test.ts:110](../../../server/tests/unit/billing/attach/overlay-attach-runtime-balances.test.ts#L110)

If another accepted track moves `A` from `95` to `90` during the request, publication applies that `-5` delta to `B`, publishes `190`, and advances the view epoch. [atomic-full-subject-publication.test.ts:92](../../../server/tests/integration/others/redis/atomic-full-subject-publication.test.ts#L92)

```text
┌──────────────┐   ┌──────────────┐   ┌────────────────┐   ┌────────────────┐
│ setup        │   │ compute      │   │ execute        │   │ publish        │
│ PG structure │──►│ billing plan │──►│ Stripe + PG    │──►│ rebase + epoch │
│ + live facts │   │ + A→B map    │   │ new structure  │   │ guarded PG sync│
└──────────────┘   └──────────────┘   └────────────────┘   └────────────────┘
```

The attach action already follows setup → compute → Stripe evaluation → execute → transition publication. [attach.ts:64](../../../server/src/internal/billing/v2/actions/attach/attach.ts#L64) Its published transition is explicitly `source entitlement → target entitlement + observed source balance/adjustment`, then the publisher reloads final Postgres structure and atomically rebases the live delta. [autumnBillingPlan.ts:100](../../../shared/models/billingModels/plan/autumnBillingPlan.ts#L100) [publishBillingTransition.ts:39](../../../server/src/internal/billing/v2/publish/publishBillingTransition.ts#L39)

So attach's runtime invariant is not “set the new balance to `200`.” It is “replace A with B while preserving every mutation accepted after A was observed.”

## What this map does not choose

The facts above are the behavioral contract. Kafka keys and records, worker commands, SQLite tables, snapshot contents, and recovery offsets come after the `check`, `track`, and `attach` traces prove exactly which subset each path needs.
