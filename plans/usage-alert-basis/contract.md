# Usage alert basis — contract, surface, test plan

Synthesised from three audits (architecture, edge-case correctness, test harness) against origin/dev on 2026-09-03.

## Spec corrections (verified in code)

| Spec claim | Reality | Consequence |
|---|---|---|
| Tuesday's fire would dedup against Monday | Idempotency key already has a minute bucket (`checkUsageAlerts.ts:205`). | Key still needs `basis` + filter key: a `balance` and a `usage_limit` alert at the same threshold collide today. Add `window_start_at` too. |
| usage_limit alert on an unlimited feature is meaningful | Unlimited tracks pass `[]` window limits (`prepareFeatureDeductionV2.ts:117`); counters never move. | Skip, same as balance bases. |
| Legacy V1 postgres path has no FullSubject | True. Also `executePostgresDeductionV2.ts:130` passes a FullSubject but never enforces windows. | Log on both paths; usage_limit alerts dormant there. |
| "Widen the dedup tuple" | No usage_alert uniqueness check exists on customer, entity, plan or org schemas. | Add `usageAlertIdentity` from scratch, mirroring `usageLimitIdentity` (`mergeCustomerBillingControlsForCheck.ts:17`). |
| Pass FullSubject through fireTrackWebhooks | It already has them (`fireTrackWebhooks.ts:17`); the conversion to FullCustomer happens at :36. | Change `checkUsageAlerts` signature to take FullSubjects. |
| `included` = no top-ups | `included_grant = allowance + adjustment` (`getApiBalance.ts:88`); rollover lands in `granted` but no breakdown field. | Document: included counts adjustments, excludes rollover. |
| usage_percentage > 100 under usage_limit | Hard cap; overflow bypasses counters. | Never fires; no special handling. |

## Bugs found that block the feature

- `applyUsageWindowUpdatesToFullSubject.ts:22-27` keeps only entity-scope rows on an entity subject, dropping the customer-scope counter. A customer-owned limit inherited by an entity reads usage 0 after an entity track → alert can never fire. Must fix (read all scopes for the deducted feature).
- `BalancesLimitReachedSchema` lacks the `filter` field `checkLimitReached.ts:76` already sends.

## Decisions (defaults unless overridden)

1. No matching limit at update time → reject (400) on customer, entity and plan updates. Resolution at validation uses the same entity → customer → plan inheritance. A limit that disappears later (plan cancelled, limit disabled) makes the alert dormant at fire time.
2. Org-scope alerts reject `basis: usage_limit` at the schema, not only in the UI.
3. Alert filter reuses `UsageLimitFilterSchema` verbatim so values canonicalise before `usageLimitFilterKey`.
4. Customer-scope alert evaluated on an entity track resolves the limit exactly as enforcement does (`fullSubjectToUsageWindowLimits` with the subject's entity). The alert follows the limit's scope.
5. `limit: 0` or denominator 0 → percentage alerts skip; absolute alerts still evaluate.
6. One `now` per check, shared by old and new measurement, so a mid-request rollover collapses old usage to 0 via `getCurrentUsageWindowUsage.ts:20`.
7. Fix `applyUsageWindowUpdatesToFullSubject` here (post-Lua TypeScript, Lua untouched).
8. `limit_reached` block ships in this branch as its own slice.
9. `apiBalanceV1ToIncludedGrant` / `apiBalanceV1ToRecurringGrant` go in shared `convert/`.
10. Credit-system member features (limit dimension = credits) are out of scope for this slice; noted below.

## Contract

```
New types/fields:
  DbUsageAlert.basis:  "balance" | "included" | "recurring" | "usage_limit"   default "balance"
  DbUsageAlert.filter: UsageLimitFilter (optional; valid only with basis usage_limit)
  usage_alerts uniqueness: (feature_id, basis, filterKey, threshold_type, threshold) on customer, entity, plan, org
  Org config usage_alerts: basis usage_limit rejected

Webhook balances.usage_alert_triggered:
  usage_alert.basis   always present
  usage_alert.filter  present iff alert has a filter
  balance   { usage, granted, included, remaining }                        iff basis != usage_limit
  usage_limit { limit, interval, anchor, usage, remaining, window_start_at, window_end_at }  iff basis == usage_limit

Webhook balances.limit_reached:
  filter      (schema catch-up, already emitted)
  usage_limit { limit, interval, anchor, usage, remaining, window_start_at, window_end_at }  iff limit_type == usage_limit

Behaviours:
  basis balance   → denominator = granted (unchanged)
  basis included  → denominator = Σ breakdown.included_grant
  basis recurring → denominator = Σ (included_grant + prepaid_grant) where reset != null
  basis usage_limit → numerator = window counter usage, denominator = limit.limit, matched on (feature_id, filterKey)
  remaining = max(0, denominator − usage) for every basis
  denominator 0 / unlimited → percentage alerts skip (all bases)
  update with usage_limit alert and no resolvable limit → 400
  limit removed or disabled after the alert exists → usage_limit alert dormant
  old/new compared only inside one window (old reads 0 after rollover)
  re-fires each window
  bulk track crossing two thresholds fires both
  entity-owned limit → entity counter; inherited customer limit → customer aggregate counter (requires the row-filter fix)

Side effects:
  svix idempotency key gains basis, filterKey, window_start_at (or "_" for balance bases)
  log line when a usage_limit alert is evaluated on a path without window enforcement
```

## Implementation surface

```
shared/models/cusModels/billingControls/
├── usageAlert.ts                          basis enum, filter, "filter only with usage_limit" check
├── usageAlertIdentity.ts                  NEW: (feature_id, basis, filterKey, threshold_type, threshold) string
├── customerBillingControls.ts             usage_alerts dedup via usageAlertIdentity
shared/api/billingControls/entityBillingControls.ts   same dedup; limits dedup gains filter key
shared/models/orgModels/orgConfig.ts (or where org alerts are declared)   reject basis usage_limit
shared/api/webhooks/balances/
├── balancesUsageAlertTriggered.ts         basis, filter, balance | usage_limit blocks
├── balancesLimitReached.ts                filter, usage_limit block
shared/api/customers/cusFeatures/utils/convert/
├── apiBalanceV1ToIncludedGrant.ts         NEW shared helper (ask before adding)
├── apiBalanceV1ToRecurringGrant.ts        NEW shared helper (ask before adding)

server/src/internal/balances/trackWebhooks/
├── fireTrackWebhooks.ts                   hand FullSubjects to checkUsageAlerts and checkLimitReached
├── checkLimitReached.ts                   usage_limit block from fullSubjectToUsageWindowLimits
└── usageAlerts/
    ├── checkUsageAlerts.ts                orchestrator: now → per scope: resolve → measure → crossed → send
    ├── types/ usageAlertMeasurement.ts, scopedUsageAlerts.ts, alertScope.ts
    ├── resolve/ resolveCustomerScopeAlerts.ts, resolveEntityScopeAlerts.ts, resolveOrgScopeAlerts.ts, filterEnabledUsageAlertsForFeature.ts
    ├── measure/ measureUsageAlert.ts, measureBalanceBasis.ts, measureUsageLimitBasis.ts, findUsageWindowLimitForAlert.ts
    ├── wasThresholdCrossed.ts             pure over {usage, denominator, remaining}
    └── send/ buildUsageAlertIdempotencyKey.ts, buildUsageAlertPayload.ts, sendUsageAlertWebhook.ts

server/src/internal/balances/utils/deductionV2/applyUsageWindowUpdatesToFullSubject.ts   keep customer-scope rows on entity subjects

Owning layer: trackWebhooks (post-deduction observer). Deduction Lua untouched.
```

## Test plan

Files under `server/tests/integration/balances/track/usage-alerts/` (A, B) and `server/tests/integration/crud/customers/customer-billing-controls.test.ts` (C). Webhooks observed through Svix Play (`setupWebhookTest` / `waitForWebhook`, event type `balances.usage_alert_triggered`). Rollover simulated with `expireUsageWindowForReset`.

| # | Case | Setup |
|---|---|---|
| A1 | default basis balance; payload has `basis: "balance"` + `balance` block | monthlyMessages(1000); alert 80 usage_percentage; track 800 |
| A2 | included ignores prepaid top-up | monthly 1000 + prepaid 500 attached qty; track 800 fires; `balance.included: 1000` |
| A3 | recurring excludes lifetime grant | monthly 1000 + prepaid 500 + lifetime 300; recurring = 1500; track 1200 fires |
| A4 | remaining / remaining_percentage under included = max(0, included − usage) | as A2 with remaining alert |
| A5 | included = 0 skips | prepaid-only; alert basis included; no fire |
| A6 | unlimited skips for balance bases | unlimitedMessages |
| A7 | bulk track crosses 80 and 100, both fire | two alerts; track 1000 |
| B1 | usage_limit basic; `usage_limit` block with bounds from `getUsageWindowBounds` | limit 200/day utc; alert 80 usage_percentage basis usage_limit; track 160 |
| B2 | filtered limit + filtered alert; non-matching property does not fire; `usage_alert.filter` echoed | filter `{apiKeyId:"key-a"}` |
| B3 | filter identity drift `123` vs `"123"` matches | numeric on limit, string on alert |
| B4 | plan-supplied limit + customer alert | `products.base({ billingControls: { usage_limits } })` |
| B5 | limit removed after alert exists (plan cancelled) → dormant | plan limit, customer alert, cancel plan, track |
| B6 | limit disabled → quiet | `enabled: false` |
| B7 | entity-owned limit → entity counter, `entity_id` in payload | `setEntityUsageLimit` + entity alert |
| B8 | customer limit inherited by entity → aggregate counter fires on entity track | customer limit + customer alert, track with entity_id (covers the row-filter bug) |
| B9 | unlimited + usage_limit alert → no fire | unlimitedMessages + limit |
| B10 | re-fires after rollover | track 160 → fire; expire window; track 160 → second fire |
| B11 | rollover mid-track never fires a false remaining alert | remaining 5; track 190; expire; track 1; no fire |
| B12 | bulk track crosses 80 and 100 on the window path | two alerts; track 200 |
| B13 | two caps (filtered + unfiltered) alert independently | two limits, two alerts |
| B14 | limit_reached carries `usage_limit` block + `filter` | limit 5; track 5 |
| B15 | limit: 0 → percentage alert skips, absolute usage alert at 0 never crosses | limit 0 |
| C1 | filter without basis usage_limit → 400 | customers.update |
| C2 | duplicate identity rejected; same tuple with different basis accepted | customers.update |
| C3 | basis + filter round-trip on cached and skip_cache reads | customers.get |
| C4 | entity alert accepts basis/filter; entity limit dedup is filter-aware | entities.update |
| C5 | org alert with basis usage_limit rejected | org config update |
| C6 | usage_limit alert with no resolvable limit → 400 on customer, entity and plan updates; resolves through customer-own, entity-own and plan limits | customers.update / entities.update / products.create |

Unit (`server/tests/unit/balances/`): `wasThresholdCrossed` over measurements incl. denominator null; `usageAlertIdentity` canonicalisation; V1 postgres path logs and skips usage_limit basis.

## Out of scope, noted

- Credit-system member feature with a usage_limit alert: `featuresForUsageAlertsAndLimit` only yields the pool feature. Would need `usageWindowMutations` as the trigger source. Separate slice.
- `billing_cycle` anchor with no anchor entitlement reports configured anchor while bounds are UTC calendar. Existing behaviour.

## Implementation notes (2026-09-03)

- Firing code lives in `server/src/internal/balances/usageAlerts/check/` (resolve → measure → wasThresholdCrossed → send) and write-time validation in `server/src/internal/balances/usageAlerts/validate/`. This is one domain folder rather than the `trackWebhooks/usageAlerts/` placement first proposed, so validation and firing share a home.
- `usageWindowLimitToWebhookBlock` sits in `server/src/internal/balances/utils/usageWindows/`; both the alert path and `checkLimitReached` build the `usage_limit` block through it. Candidate for `@autumn/shared` later.
- `usageLimitIdentity` moved next to `usageLimitFilterKey` in `shared/models/cusModels/billingControls/usageLimit.ts`; `mergeCustomerBillingControlsForCheck.ts` re-exports it.
- Breakdown entries for one-off grants carry `reset: { interval: "one_off" }`, not `null`. `apiBalanceV1ToRecurringGrant` excludes that interval.
- `basis` is stored explicitly (`.default("balance")`), so legacy rows without it are normalised at read with `alert.basis ?? "balance"` in the firing path.
- Plan-level alerts validate against the plan's own `usage_limits` inside `PlanBillingControlsParamsSchema`; customer and entity updates validate in their actions with the resolved FullSubject.
- Dashboard: plan form gets a basis dropdown only (plan limits carry no filter in the UI); the customer/entity sheet gets basis plus the shared condition editor; the org dialog offers the three balance bases.
- Idempotency key adds basis, filter key and window start alongside the existing minute bucket.

## Outside this repo

- `packages/autumn-js/src/generated/*` and `packages/sdk/src/models/*` are generated from the OpenAPI spec; regenerate after this ships so `basis` / `filter` appear on the SDK alert types.
- The `atmn` CLI compose type for plan alerts carries `basis` and `filter` already.
