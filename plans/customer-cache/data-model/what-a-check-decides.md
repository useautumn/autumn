---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# What a check decides

A check is a deduction dry-run: draw `required_balance` under `overageBehavior: "reject"`, allow
iff nothing is left unpaid (`commands/check/computeCheck.ts:10-23`, `deduction/deduct.ts:39-43`).
Buckets are drawn in order: unlimited → rollovers → included (to 0) → overage (to `minBalance`)
(`deductFromRows.ts:30-51`).

## The worker's answer is a verdict, not a number

```ts
CheckResult = { allowed, reason: "insufficient_balance" | "feature_not_attached" | null,
                limitType: "usage_limit" | "included" | "spend_limit" | "max_purchase" | null,
                requiredBalance /* in funding units */, fundingFeatureId, isFlag }
                                                          // check/types/checkResult.ts:4-15
CheckReply  = { result, state: SubjectState, catalog: Catalog }   // contracts/check.ts:14-19
```

The numbers the API shows (`granted`, `remaining`, `usage`, `next_reset_at`, `max_purchase`) are
rendered on the server from `state` + `catalog` (`balanceWorkerCheckReply.ts:55-62`,
`workerStateToApiBalance.ts:30-54`). The headroom (the largest `required_balance` that would
still pass) is computed internally as `DeductionOutcome.appliedValue` (`deduct.ts:47`) and dropped
by `computeCheck`.

## Three checks, run through it

| scenario | rows | required | result |
|---|---|---|---|
| A · pro, `api_calls` included 1000, used 905 | balance 95, no overage | 100 | `allowed:false, limitType:"included"`; API `remaining 95, overage_allowed false` |
| B · usage price, allowance 1000, `usage_limit` 1500, used 1300 | balance -300, `minBalance` -500 (`resolveRowBounds.ts:116`) | 250 | refused, `limitType:"max_purchase"`; 200 passes; API `remaining 0, usage 1300, max_purchase 500` |
| C · `credits` funds `gpt4_tokens` at 0.5/token; credits remaining 40 | credits row selected via `fundsFeatureId` (`selectDeductionRows.ts:73-75`) | 100 tokens | needs 50 credits, has 40 → refused; `requiredBalance 50, fundingFeatureId "credits"` |

## What moves the answer besides the balance

| factor | effect | where |
|---|---|---|
| rollovers | drawn first; expired dropped | `deduct.ts:22`, `selectDeductionRows.ts:83-89` |
| usage windows | per-row cap that expires at `window_end_at` | `deductFromRows.ts:157-172` |
| entity | entity subject draws its own key on per-entity rows; customer draws all keys | `resolveRowBounds.ts:58-61` |
| pooled | grant from `pooled_balance.granted` | `cusEntToStartingBalance.ts:37` |
| spend limit | replaces the row floor in the overage bucket | `deductFromRows.ts:174-188` |
| past due, org flags | blocked product stops funding; `include_past_due`, `reverse_deduction_order` | `selectDeductionRows.ts:37-47`, `toDeductionSelection.ts:39-42` |
| `properties` | filtered caps, dimensioned rate cards | `resolveUsageWindowLimits.ts:48-53`, `resolveCreditCosts.ts:33-43` |
| time | resets advance at the command's clock before the read | `ensureSubjectCurrent.ts:19-21`, `readCurrentSubject.ts:20-45` |

So `allowed(feature, required)` is a function of (subject rows, catalog, org config, time,
properties). For one feature it is monotone in `required`: there is exactly one headroom number
per (subject, feature, properties, instant), and it changes at every mutation of the rows that fund
the feature and at every reset boundary.

## The SDK already checks locally, with a weaker rule

`useCustomer().check` answers from the fetched customer object with no request
(`packages/autumn-js/src/react/hooks/internal/getLocalCheckResponse.ts`):

```
flag?            → allowed
credit system?   → pick main balance if it passes, else the first credit system that does
balanceToAllowed → boolean | unlimited | required < 0 → true
                   overageAllowed → remaining + availableOverage ≥ required
                   else            → remaining ≥ required          balanceToAllowed.ts:42-72
```

It ignores spend limits, usage limits, rate-card tiers, entity scope and `properties`; `entityId`
is only echoed back. The Node SDK has no local path: `check` is always `POST /v1/balances.check`
(`packages/sdk/src/funcs/check.ts:118`). A hook system exists on the Node SDK
(`hooks/registration.ts`: SDKInit, BeforeRequest, AfterSuccess, AfterError) and `FailOpenHook`
already rewrites 5xx on check/track into `{allowed:true}` (`failOpenHook.ts:60-93`). Alon's prototype
added `hooks/localCacheHook.ts` beside it.
