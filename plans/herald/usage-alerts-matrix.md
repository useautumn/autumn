# Usage alerts: the case matrix

What prod decides today (`server/src/internal/balances/usageAlerts/check/`), so the herald
implementation can be checked cell by cell. The integration files under
`server/tests/integration/balances/track/usage-alerts/` are the executable form; they must
pass on the legacy path (baseline) and then on the worker path (herald).

## Which alerts a track considers, and what each is measured on

`resolveAlertScopes` picks the scopes; `resolveScopeApiBalances` picks the balance each scope
reads. The scope's `entityId` decides the balance, not the track's.

| Track sent with | Scopes considered, in order | Balance each scope is measured on |
|---|---|---|
| `customer_id` only | customer (falls back to plan) → org | customer, customer |
| `customer_id` + `entity_id` | customer (falls back to plan) → entity → org | customer, entity, entity |

- Customer scope: the customer's own `usage_alerts` for the feature; if none, the first plan
  (billing-control product) that has any for the feature. Customer alerts shadow plan alerts;
  they never merge.
- Entity scope: the tracked entity's `usage_alerts`. Only on an entity track.
- Org scope: `org.config.usage_alerts` in live, `sandbox_usage_alerts` in sandbox; an alert with
  no `feature_id` applies to every feature. Org is additive with the others.
- Disabled alerts are dropped before measuring.

## What "crossed" means

`wasThresholdCrossed`, per alert, from a before/after measurement:

| threshold_type | fires when |
|---|---|
| usage | before.usage < t and after.usage >= t |
| remaining | before.remaining > t and after.remaining <= t |
| usage_percentage | before% < t and after% >= t, both over the basis denominator |
| remaining_percentage | before% > t and after% <= t |

Percent types need a denominator on both sides; unlimited balances never measure.

## Basis: what 100% means

| basis | denominator | remaining |
|---|---|---|
| balance (default) | granted | api remaining |
| included | included grant | max(0, denominator − usage) |
| recurring | recurring grant | max(0, denominator − usage) |
| usage_limit | the cap with the same feature and filter (customer counters on a customer track; entity's own cap on an entity track) | cap − window usage |

## Delivery

One Svix message per fired alert. Idempotency key =
`org:env:customer:entity|_:scope:feature:basis:filterKey|_:thresholdType:threshold:periodStart|_:minuteBucket`,
so a windowed alert re-fires each window and a burst within a minute fires once.

## Cells and the file that covers each

| Cell | File |
|---|---|
| customer alert, customer track, 4 threshold types, no re-fire, disabled | `usage-alert-basic` |
| basis balance / included / recurring, included=0, unlimited, bulk crossing two thresholds | `usage-alert-basis` |
| entity alert on entity track; sibling entity unaffected; customer + entity both fire; below threshold | `usage-alert-entities` |
| customer or plan alert on an entity track (customer balance, no entity_id) | `usage-alert-inherited-on-entity-track` |
| plan alert as fallback on a customer track; entity alert skipped on a customer track | `usage-alert-plan-default-customer-track` |
| customer alert shadows plan; entity fires additively | `usage-alert-plan-customer-override` |
| org alert: customer balance, entity balance, many customers, with customer alert, global (no feature), disabled | `usage-alert-org` |
| org sandbox vs live config | `usage-alert-org-env` |
| org thresholds above 100% | `usage-alert-org-over-100pct` |
| org + customer + entity all fire, org follows the tracked entity | `usage-alert-org-vs-scopes` |
| basis usage_limit: caps, filters, plan caps, entity vs inherited caps, window rollover, zero cap | `usage-alert-usage-limit`, `-edge-cases`, `usage-alert-free-tier-daily-cap` |
| credit systems: remaining and remaining_percentage on the funding feature | `usage-alerts-credit-system` |
| 500 concurrent tracks, exactly one fire | `usage-alerts-race-condition` |
| pooled balance at 50% after attach | `pooled-balances/pooled-balance-usage-alert` |
| a lock under the threshold then a finalize above it fires once; a lock already past it fires on the lock and not again on settle | `lock/finalize-lock-usage-alert` (both paths ✓), package `check-usage-alerts.test.ts` "a lock and its finalize" |

The cell "an entity alert must NOT fire on a customer track that drains the customer balance" is pinned
twice: `plan-default-cus-track` (aggregate 150 → 10 under an entity `remaining: 20` alert) and the
package's `check-usage-alerts.test.ts` "a customer track never considers an entity's alerts".

## Baseline and parity runs

Record the pass/fail per file for both runs here. Both runs: `bun t balances/track/usage-alerts`
(parallel, max 2, failed files retried once), with `BALANCE_WORKER_ROLLOUT_ENABLED` hardcoded.

Local quirk: the test process's `clearOrgCache` no-ops (Redis not ready in-process), so org-level
files read a stale `org_with_features:<org>:sandbox` from Dragonfly and fail falsely. Both runs
had a loop deleting that key every 250 ms; that is a local fixture problem, not a code one.

| File | legacy path (rollout off) | worker path (herald) |
|---|---|---|
| usage-alert-basic | ✓ | ✓ |
| usage-alert-basis | ✓ | ✓ |
| usage-alert-entities | ✓ | ✓ |
| usage-alert-inherited-on-entity-track | ✓ | ✓ |
| usage-alert-plan-default-customer-track | ✓ | ✓ |
| usage-alert-plan-customer-override | ✓ | ✓ |
| usage-alert-org | ✓ (88 s) | ✓ (88 s) |
| usage-alert-org-env | ✓ | ✓ |
| usage-alert-org-over-100pct | ✓ | ✓ |
| usage-alert-org-vs-scopes | ✓ | ✓ |
| usage-alert-usage-limit | ✓ (330 s) | ✓ (369 s) ¹ |
| usage-alert-usage-limit-edge-cases | ✓ | ✓ ¹ |
| usage-alert-free-tier-daily-cap | ✓ | ✓ ¹ |
| usage-alerts-credit-system | ✓ | ✓ |
| usage-alerts-race-condition | ✓ | ✓ |
| pooled-balance-usage-alert | ✓ | ✗ ² |

Legacy run: 16/16, 739 s wall. Worker run: 15/16.

¹ Passed once `expireUsageWindowForReset` also evicts the worker: it backdates `usage_windows` in
Postgres and Redis directly, and the worker's resident copy answered 409 `balance_worker_stale_subject`
until it was told. Same rule as prod code: a direct row write must evict.

² Worker path answers `UNSUPPORTED_COMMAND feature_not_found` for an entity track on a pooled
feature: the worker has no pooled balances yet. Not a herald difference.

Two things the worker run needed before any alert fired at all: `subjectRowsEnvelope` had to pick
`usage_alerts` (it dropped the column on hydration), and `commitFlush` had to roll back on a stale
guard (see `plans/balance-worker-partition-resilience`).
