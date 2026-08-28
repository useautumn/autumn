# How a check becomes a decision

The current endpoint has two contracts behind one request:

- a **plain check** reads the latest customer state and evaluates it without consuming the requested amount;
- `send_event: true` or `lock.enabled: true` turns the check into an **atomic decision and mutation** through the track engine.

That split matters more than the fact that Redis implements both paths today.

## One real request, end to end

This exercised scenario has a metered `action1` feature funded by credits at `0.2` credits per action. The customer has used `3` of a `5`-action window and still has about `99.4` credits.

```text
POST /check
customer_id       uw-check-convert-1
feature_id        action1
required_balance  3 actions
properties        {}

             validate + normalize
                       │
                       ▼
┌──────────────── customer runtime root ────────────────┐
│ read set: action1 + every linked credit system       │
│ serving balance: credits ≈ 99.4                      │
│ action1 usage window: 3 used / 5 limit               │
└───────────────────────┬───────────────────────────────┘
                        │ choose the funded balance
                        ▼
              action1 → credits
              3 actions × 0.2 = 0.6 credits
                        │
                        ▼
┌──────────────────── decision ─────────────────────────┐
│ credit balance       99.4 ≥ 0.6                 pass │
│ action1 headroom     2 actions = 0.4 credits    fail │
└───────────────────────┬───────────────────────────────┘
                        ▼
                  allowed: false
```

The integration test proves the boundary: `2` more actions pass, `3` fail, even though the credit pool can easily fund both. [usage-window-check.test.ts:89](../../../server/tests/integration/balances/usage-windows/usage-window-check.test.ts#L89)

The decision works because the original feature is retained after the engine selects its credit pool. The requested action units are converted to credits, and the original feature's remaining window is converted into the same unit before comparison. [getCheckResponseV2.ts:34](../../../server/src/internal/balances/check/getCheckResponseV2.ts#L34) [apiSubjectToUsageLimitHeadroom.ts:47](../../../shared/api/customers/utils/apiSubjectToUsageLimitHeadroom.ts#L47)

## The exact plain-check path

| Stage | What the current code does |
| --- | --- |
| **1 · Accept** | `/check`, `/entitled`, and `/balances.check` share one handler. The body must name exactly one `feature_id` or legacy `product_id`; the required amount defaults to `1`. [balancesRouter.ts:29](../../../server/src/internal/balances/balancesRouter.ts#L29) [checkParams.ts:52](../../../shared/api/balances/check/checkParams.ts#L52) |
| **2 · Bound the read** | Resolve the requested feature from the org catalog, discover every credit system linked to it, and request only those feature IDs. [getCheckDataV2.ts:32](../../../server/src/internal/balances/check/getCheckDataV2.ts#L32) |
| **3 · Read the root** | Fetch the partial customer or entity `FullSubject`. A cache hit reads the subject epoch, relevant balance hashes, pooled values, and usage windows; a miss hydrates from Postgres under a two-second budget, fills the cache, then re-reads live balances so an in-flight deduction is not overwritten. [getCheckDataV2.ts:68](../../../server/src/internal/balances/check/getCheckDataV2.ts#L68) [getOrSetCachedPartialFullSubject.ts:38](../../../server/src/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.ts#L38) |
| **4 · Build the decision view** | Build one API subject for the returned balance and another for evaluation. The evaluation view merges entity → customer → plan controls, decorates usage caps with live window usage, and resolves percentage spend limits to absolute limits. [buildEvaluationSubject.ts:22](../../../server/src/internal/balances/check/buildEvaluationSubject.ts#L22) |
| **5 · Select the balance** | Prefer an allowed direct feature balance; otherwise choose an owned linked credit system, then retain deterministic fallbacks for a denied or missing entitlement. [getFeatureToUseForCheck.ts:8](../../../shared/api/customers/cusFeatures/utils/check/getFeatureToUseForCheck.ts#L8) |
| **6 · Decide and shape** | Convert the requested amount when a credit pool is selected, evaluate the resulting balance and controls, then return `allowed`, customer/entity identity, the evaluated required amount, balance, and flag. Optional preview lookup happens only after this decision. [getCheckResponseV2.ts:11](../../../server/src/internal/balances/check/getCheckResponseV2.ts#L11) [handleCheck.ts:97](../../../server/src/internal/api/check/handleCheck.ts#L97) |

“Plain” means the requested usage is not consumed. It does **not** mean the request performs no writes at all: cache hydration can fill serving state, cache reads can run lazy resets, and feature selection can trigger auto top-up asynchronously. [getCachedPartialFullSubject.ts:296](../../../server/src/internal/customers/cache/fullSubject/actions/partial/getCachedPartialFullSubject.ts#L296) [getCheckDataV2.ts:120](../../../server/src/internal/balances/check/getCheckDataV2.ts#L120)

## The decision order

```text
no evaluable entitlement or flag                      → deny
flag                                                  → allow
boolean / unlimited / negative required amount        → allow
matching usage-window headroom is too small            → deny
overage explicitly disabled                            → compare included balance
overage enabled                                        → balance + spend/max-purchase headroom
ordinary finite balance                                → compare remaining
```

Usage windows run before overage, so extra purchasable capacity cannot bypass a cap. Property-filtered windows participate only when the request properties match. When several applicable windows exist, the smallest remaining headroom wins. [apiBalanceToAllowed.ts:27](../../../shared/api/customers/cusFeatures/utils/convert/apiBalanceToAllowed.ts#L27) [apiSubjectToUsageLimitHeadroom.ts:34](../../../shared/api/customers/utils/apiSubjectToUsageLimitHeadroom.ts#L34)

Pooled balances do not create another decision path. Two `500` contributions are exposed as one `1,000` balance; exactly `1,000` is allowed and `1,001` is denied for both customer and entity views. [check-pooled-balances.test.ts:162](../../../server/tests/integration/balances/check/pooled-balances/check-pooled-balances.test.ts#L162)

## When the check also mutates

```text
                         ┌─ plain ───────────────► evaluate snapshot ─► reply
request → partial read ──┤
                         └─ send_event / lock ──► reload full subject
                                                    │
                                                    ▼
                                          atomic reject-on-overage
                                          balance + usage windows
                                          + optional lock receipt
                                                    │
                                                    ▼
                                          post-mutation reply
                                          + queued PG sync/event
```

`runCheckV2` makes this fork directly. A plain request calls the evaluator; `send_event` or a lock calls `runCheckWithTrackV2`. [runCheckV2.ts:20](../../../server/src/internal/balances/check/runCheckV2.ts#L20)

The mutation branch builds a normal track for the original feature with `overage_behavior: "reject"`. The track engine reloads the full subject and makes the balance deduction, usage-window increment, idempotency claim, and optional lock receipt in the same Redis script. Insufficient balance or a usage cap becomes `allowed: false`; success returns the post-mutation balance. [runCheckWithTrackV2.ts:101](../../../server/src/internal/balances/check/runCheckWithTrackV2.ts#L101) [executeRedisDeductionV2.ts:116](../../../server/src/internal/balances/utils/deductionV2/executeRedisDeductionV2.ts#L116)

After the atomic mutation, the current implementation queues the Postgres projection and analytics event. A lock with an explicit expiry also schedules release; reusing a live lock ID returns `409`. [runRedisTrackV3.ts:143](../../../server/src/internal/balances/track/v3/runRedisTrackV3.ts#L143) [runCheckWithTrackV2.ts:160](../../../server/src/internal/balances/check/runCheckWithTrackV2.ts#L160) [check-with-lock-errors.test.ts:47](../../../server/tests/integration/balances/lock/check-with-lock-errors.test.ts#L47)

The behavioral contract to carry forward is therefore: **plain check reads one ordered customer root; check-and-track and check-and-lock decide and mutate that same root atomically before replying.**

## Current operational edges

These are facts about today's implementation, not requirements for the replacement engine:

- The org rate cap and transient Redis/DB failures return `allowed: true` with null balance and HTTP `202` for feature checks, including lock checks. A separate three-second route timeout covers plain and `send_event` checks; locks are excluded from that timeout fallback because an abandoned request could still reserve balance. [runCheckWithRollout.ts:20](../../../server/src/internal/balances/check/runCheckWithRollout.ts#L20) [handleCheck.ts:19](../../../server/src/internal/api/check/handleCheck.ts#L19)
- `skip_cache` sends the mutation branch to its Postgres fallback. That SQL path currently omits hard usage-window enforcement, so it is not semantically identical to the Redis path. [executePostgresDeductionV2.ts:126](../../../server/src/internal/balances/utils/deductionV2/executePostgresDeductionV2.ts#L126)
- The public response exposes the decision and balance, not the evaluator's internal denial category. [checkResponseV3.ts:10](../../../shared/api/balances/check/checkResponseV3.ts#L10)

Those differences need an explicit product decision later. This page only fixes the current behavior in place before the worker command and state model are designed.
