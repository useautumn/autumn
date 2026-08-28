# How attach replaces a live balance

## One immediate upgrade, end to end

```text
scenario   Pro grants 100 messages; the customer has 95 left
action     attach Premium with a 200-message grant
race       another Track deducts 5 while Stripe and Postgres are changing
expect     Premium becomes live with 190, not 195 or 200
```

```text
POST /billing.attach  plan_id=premium
        │
        ▼
┌─ 1 · SETUP ───────────────────────────────────────────────────────┐
│ Postgres structure: A allowance 100 · balance 100                │
│ Redis runtime:     A balance 95 · subject epoch 2                │
│ output: FullCustomer with Postgres structure + live A = 95       │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌─ 2 · COMPUTE ─────────────────────────────────────────────────────┐
│ draft target: B allowance 200 · balance 195                      │
│ typed intent: A → B · observed A balance 95 · adjustment 0       │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌─ 3 · EXECUTE ─────────────────────────────────────────────────────┐
│ Stripe changes, then Autumn writes the new Postgres structure    │
│ Postgres now contains B = 195                                    │
│                                                                  │
│ concurrent Track: live Redis A 95 → 90                           │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌─ 4 · PUBLISH ─────────────────────────────────────────────────────┐
│ reload final B from primary Postgres                             │
│ observe live A = 90 · additional usage since compute = 5         │
│ atomically publish B = 195 - 5 = 190 · epoch 2 → 3 · delete A    │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
┌─ 5 · PERSIST ─────────────────────────────────────────────────────┐
│ compare-and-set Postgres B from expected 195 to published 190    │
│ if the write fails: queue that exact guarded update for retry    │
└──────────────────────────────────────────────────────────────────┘
```

Setup deliberately combines two sources. Product structure still comes from Postgres, while mutable balance fields are overlaid from the cached runtime subject without running lazy resets. [setupAttachBillingContext.ts:62](../../../server/src/internal/billing/v2/actions/attach/setup/setupAttachBillingContext.ts#L62) [overlayAttachRuntimeBalances.ts:41](../../../server/src/internal/billing/v2/actions/attach/setup/overlayAttachRuntimeBalances.ts#L41) The focused test turns Postgres `A = 100` plus Redis `A = 95` into the runtime input used by compute. [overlay-attach-runtime-balances.test.ts:66](../../../server/tests/unit/billing/attach/overlay-attach-runtime-balances.test.ts#L66)

Compute applies the existing usage to the new customer product and emits the mapping at the same time. The mapping records the exact source and target entitlement IDs plus the source balance and adjustment observed by compute. [applyExistingStatesToCustomerProduct.ts:22](../../../server/src/internal/billing/v2/utils/initFullCustomerProduct/applyExisting/applyExistingStatesToCustomerProduct.ts#L22) [autumnBillingPlan.ts:100](../../../shared/models/billingModels/plan/autumnBillingPlan.ts#L100) The test's concrete output is target `B = 195` and an `A → B` transition frozen at `A = 95`. [overlay-attach-runtime-balances.test.ts:110](../../../server/tests/unit/billing/attach/overlay-attach-runtime-balances.test.ts#L110)

The action then evaluates Stripe, executes Stripe, writes the Autumn plan, and only afterward publishes the runtime transition. [attach.ts:181](../../../server/src/internal/billing/v2/actions/attach/attach.ts#L181) [executeBillingPlan.ts:29](../../../server/src/internal/billing/v2/execute/executeBillingPlan.ts#L29) The route's customer billing lock serializes competing Attach requests in non-development runtimes; it does not stop Tracks from mutating the customer's runtime root during the external work. [handleAttachV2.ts:21](../../../server/src/internal/billing/v2/handlers/handleAttachV2.ts#L21)

## The intent compute hands to publication

```text
BalanceTransitionPlan
{
  id: "customer_product_b",
  outgoingCustomerEntitlements: [A at compute time],
  transitions: [{
    sourceCustomerEntitlementId: "A",
    targetCustomerEntitlementId: "B",
    sourceBalance: 95,
    sourceAdjustment: 0
  }]
}
```

This is current in-process billing intent, not a Kafka record. It lives on `AutumnBillingPlan`; when payment defers execution, Autumn serializes the complete billing plan and context into metadata, including this exact transition and the stage from which execution must resume. [autumnBillingPlan.ts:107](../../../shared/models/billingModels/plan/autumnBillingPlan.ts#L107) [insertMetadataFromBillingPlan.ts:31](../../../server/src/internal/metadata/utils/insertMetadataFromBillingPlan.ts#L31)

The snapshot makes the later rebase deterministic:

```text
additional usage
  = (live A adjustment - observed A adjustment)
  - (live A balance    - observed A balance)

  = (0 - 0) - (90 - 95)
  = 5

published B = computed B 195 - 5 = 190
```

Publication does not recompute which entitlements correspond. It consumes the mapping compute already chose. The Lua operation uses the recorded source values only to measure what changed after compute. [publishCachedFullSubject.lua:95](../../../server/src/_luaScriptsV2/fullSubject/publishCachedFullSubject.lua#L95)

## Which Attach path reaches publication

| Request path | Runtime outcome |
| --- | --- |
| **Preview** | Stops after compute/evaluation. Nothing executes or publishes. |
| **New product or add-on** | There is no outgoing balance to replace, so no `A → B` plan is required. |
| **Scheduled switch** | The outgoing product remains live until activation; Attach does not create an immediate transition plan. |
| **Immediate replacement** | Executes Stripe and Postgres, then attempts the computed `A → B` publication before replying. |
| **Autumn or long-lived Checkout** | Returns Checkout without executing the plan and preserves A's cache for confirmation. |
| **Stripe-deferred invoice or Checkout** | Stores the plan, leaves A live, and does not publish yet. The payment webhook executes the stored plan and then publishes the same transition. |

Those branches are explicit in the action: preview returns before execution; scheduled transitions do not build an existing-usage handoff; Checkout returns preserve the current cache; and an immediate non-deferred plan executes before publication. [attach.ts:114](../../../server/src/internal/billing/v2/actions/attach/attach.ts#L114) [computeAttachNewCustomerProduct.ts:33](../../../server/src/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct.ts#L33) [attach.ts:127](../../../server/src/internal/billing/v2/actions/attach/attach.ts#L127) [executeBillingPlan.ts:35](../../../server/src/internal/billing/v2/execute/executeBillingPlan.ts#L35)

Deferred invoice completion runs the remaining Stripe stages, executes the stored Autumn plan, and only then publishes. [executeDeferredBillingPlan.ts:60](../../../server/src/internal/billing/v2/execute/executeDeferredBillingPlan.ts#L60)

Stripe Checkout completion has the same finish order under a customer billing lock: update the stored plan with Stripe output, execute Autumn, publish the transition, run follow-up workflows, then delete the metadata. [handleCheckoutSessionMetadataV2.ts:48](../../../server/src/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.ts#L48) [handleCheckoutSessionMetadataV2.ts:169](../../../server/src/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/handleCheckoutSessionMetadataV2.ts#L169)

## What the atomic publish changes

```text
preflight every A → B pair
        │
        ├─ source and target exist
        ├─ target is not already live
        ├─ mapping is one-to-one and same feature
        └─ both sides have a supported simple balance shape
        │
        ▼ no Redis state has changed yet
increment customer epoch
delete outgoing A fields
write rebased B fields
preserve unrelated live fields
replace subject membership with B
store transition receipt
```

All pair resolution happens before the first Redis mutation. Once validated, one Lua call increments the customer view epoch, deletes A, writes B, publishes the new subject, and stores the result receipt. [publishCachedFullSubject.lua:47](../../../server/src/_luaScriptsV2/fullSubject/publishCachedFullSubject.lua#L47) [publishCachedFullSubject.lua:105](../../../server/src/_luaScriptsV2/fullSubject/publishCachedFullSubject.lua#L105) This atomic boundary is Redis only; Stripe and Postgres have already executed outside it.

The integration test begins with compute-time `A = 95`, changes live A to `90`, and proves that publication produces `B = 190`, removes A, advances epoch `2 → 3`, and preserves an unrelated live balance rather than replacing it with its stale Postgres value. [atomic-full-subject-publication.test.ts:108](../../../server/tests/integration/others/redis/atomic-full-subject-publication.test.ts#L108)

The epoch closes the other side of the race. A Track that loaded epoch `2` before publication is rejected before its idempotency key or balance mutation is written; the Track engine can refresh the subject and retry against B. [deductFromSubjectBalances.lua:139](../../../server/src/_luaScriptsV2/fullSubjectDeduction/deductFromSubjectBalances.lua#L139) [atomic-full-subject-publication.test.ts:221](../../../server/tests/integration/others/redis/atomic-full-subject-publication.test.ts#L221)

## Replay, persistence, and cleanup

```text
publish retry ──► receipt for transition id ──► same B result, no second rebase

PG write 195 → 190
      │ failure
      ▼
exact expected + published states ──► SQS retry ──► guarded compare-and-set
```

The transition receipt is keyed by subject plus transition ID. Replaying the same publication returns its first result, so the live delta is not applied twice. A target that is already cached without that receipt, or an incomplete mapping, is rejected before A is changed. [atomic-full-subject-publication.test.ts:143](../../../server/tests/integration/others/redis/atomic-full-subject-publication.test.ts#L143) [atomic-full-subject-publication.test.ts:162](../../../server/tests/integration/others/redis/atomic-full-subject-publication.test.ts#L162)

After Redis succeeds, Postgres is corrected with a compare-and-set over the complete target state observed immediately before publication: balance, adjustment, additional balance, cache version, and next reset. A newer Postgres writer makes the update a no-op rather than being overwritten. [persistPublishedBalanceTransitions.ts:37](../../../server/src/internal/billing/v2/publish/persistPublishedBalanceTransitions.ts#L37) If that write errors, Autumn queues the exact guarded payload; a worker error is rethrown so SQS retains it for redelivery. [persistPublishedBalanceTransitions.ts:87](../../../server/src/internal/billing/v2/publish/persistPublishedBalanceTransitions.ts#L87) [processMessage-published-balance-transitions.test.ts:94](../../../server/tests/unit/queue/processMessage-published-balance-transitions.test.ts#L94)

Cache cleanup follows ownership:

- Checkout-only and deferred responses preserve A because no structural change has committed yet.
- Successful publication preserves B so request or webhook cleanup cannot delete the newly authoritative view.
- A skipped, unsupported, missing-cache, or failed publication does not set that preservation signal; the existing route/webhook cleanup invalidates the subject and later reads rebuild it from Postgres. [publishBillingTransition.ts:21](../../../server/src/internal/billing/v2/publish/publishBillingTransition.ts#L21) [refreshCacheMiddleware.ts:23](../../../server/src/honoMiddlewares/refreshCacheMiddleware.ts#L23)

Publication failure is logged after the billing plan has executed; it does not roll Stripe or Postgres back and does not turn the completed Attach into a retry of those external effects. [publishBillingTransition.ts:78](../../../server/src/internal/billing/v2/publish/publishBillingTransition.ts#L78)

## The supported atomic handoff today

| Gate | Accepted shape |
| --- | --- |
| **Compute mapping** | Exactly one numeric source and target entitlement for every carried feature; every numeric outgoing runtime balance is mapped. |
| **Attach plan** | The carry source is the current product, with no full-customer override, explicit balance carry, inserted customer entitlement, pooled-balance plan, one-off rebalance, or separate update to a transition source. |
| **Runtime balance** | A simple customer balance: no pooled/entity allocation, rollovers, replaceables, or additional balance. Source and target must describe the same feature. |
| **Runtime root** | No entity aggregation or usage-window feature state in the subject being replaced. |
| **Publication state** | The old cache exists, B is not already live, and every planned source/target still resolves. |

Compute constructs the one-to-one numeric mapping and rejects an incomplete outgoing set. [applyExistingStatesToCustomerProduct.ts:22](../../../server/src/internal/billing/v2/utils/initFullCustomerProduct/applyExisting/applyExistingStatesToCustomerProduct.ts#L22) Attach-level exclusions are recorded before execution. [computeAttachBalanceTransitionPlan.ts:40](../../../server/src/internal/billing/v2/actions/attach/compute/computeAttachBalanceTransitionPlan.ts#L40) Publication then validates the individual balance shapes and rejects feature-scoped runtime state. [classifyBalanceTransitionPair.ts:21](../../../server/src/internal/customers/cache/fullSubject/actions/classifyBalanceTransitionPair.ts#L21) [publishCachedFullSubject.ts:116](../../../server/src/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.ts#L116)

Unsupported shapes keep a named reason on the plan, including through deferred serialization, and skip this optimized publication rather than guessing a partial handoff. [publish-billing-transition.test.ts:172](../../../server/tests/unit/billing/publish/publish-billing-transition.test.ts#L172)

The current behavioral contract is: **Attach computes the structural replacement once, executes external and Postgres changes, then atomically rebases every Track accepted against A onto B before making B the serving view.** A replacement engine must preserve that ordering and retry behavior; “set B to its configured grant” is not equivalent.
