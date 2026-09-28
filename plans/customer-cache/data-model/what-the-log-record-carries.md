---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# What the log record carries

The outcome stream is the metering topic, `${deployment}-events`
(`packages/env/src/balanceWorker/balanceWorkerDeployment.ts:32`), 64 partitions in prod
(`balanceWorkerConstants.ts:4-10`). Every record is one `MutationRecord`
(`packages/kafka/src/topics/metering/types/meteringRecord.ts:3`,
`packages/balance-engine/src/models/mutation/mutationRecord.ts:20-30`).

## One track, as it lands on the log

scenario · `cus_abc` on pro, `api_calls` balance 100 · action · track 5 · the record:

```jsonc
{ "type":"mutation", "id":"cmd_1",
  "identity":{"orgId":"org_1","env":"live","customerId":"cus_abc","entityId":null},
  "subject":{"internalCustomerId":"icus_1","internalEntityId":null},
  "revision":{"before":41,"after":42},
  "command":{"type":"track","featureId":"api_calls","internalFeatureId":"ifeat_1","value":5,
             "org":{"id":"org_1","slug":"acme","config":{...6 flags},"svix":{...}}, ...},
  "changes":[{"table":"customerEntitlements","op":"increment","id":"ce_1","add":{"balance":-5}}],
  "result":{"type":"track","status":"applied",
            "deltas":[{"table":"customerEntitlements","id":"ce_1","balanceDelta":-5,"creditCost":1}],
            "deductions":[{"balance_id":"ce_1","feature_id":"api_calls","plan_id":"pro","value":5}],
            "fundingFeatureId":"api_calls"},
  "receipt":{"fingerprint":"…","expiresAt":…},
  "effects":[] }
```

Key is `["org_1","live","cus_abc"]` (`convertIdentityUtils.ts:5-10`), so a customer and all its
entities sit on one partition, in order. The org rides on every record as `command.org`: ids, six
config flags, Svix app ids, nothing secret (`models/command/commandOrg.ts:5-37`).

## What it does not carry

- **No balances.** A track is an `increment` of `-5` (`deduction/utils/convertDeductionUtils.ts:194-200`);
  100 and 95 appear nowhere. Only `update` changes carry partial before/after.
- **No catalog, no other rows.** `after.state` was removed for throughput on 2026-09-24
  (`plans/herald/effects-on-the-log.md`): "a future cache-push job reads the worker's
  `readSubjectState`, not the log."
- **No checks.** `CheckResult` is "Never logged" (`commands/check/types/checkResult.ts:3`).
  `readSubjectState`, `evict`, `flush` are not mutations either.

## Which records touch a feature

| record kind | feature ids on it |
|---|---|
| `track`, `finalize` | `command.featureId`; `result.fundingFeatureId`; `result.deductions[].feature_id` (credit system paid → both) |
| `reset` | rows in `changes` name `customerEntitlements.id`; feature only via the catalog (`entitlement_id → feature`) |
| `applyBillingPlan`, `initialize`, `updateBalance`, `deleteBalance`, `recalculateBalance` | rows only; feature via catalog |

So "which features did this record touch" is answerable from the record alone for tracks, and
needs the customer's rows plus catalog for everything else.

## When it is written

```
decide (memory) ─► append to Kafka ─► answer the caller ─► Postgres, behind, in order
                    commit.ts:158-195   commit.ts:197-218   commit.ts:113-155
```

"Kafka commit → answer log callers → hand the batch to the store" (`writer/actions/commit.ts:42-44`).
Two consequences for any reader of the log:

- Postgres lags the log. A reader that sees record N and then queries Postgres can get state from before N.
- The worker's memory is at or past N when it answers `readSubjectState` for that customer.

Catch: after a restart the same `commandId` can be on the log twice, both applied
(`plans/herald/units.md`, parked). A reader must tolerate a replayed record.
