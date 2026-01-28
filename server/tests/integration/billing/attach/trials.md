# Trials Test Plan

Tests for free trial logic in attach operations.

---

## File Structure

| File | Test Count | Description |
|------|------------|-------------|
| `trials-basic.test.ts` | 5 | Basic trial attachment and states |
| `trials-conversion.test.ts` | 5 | Trial to paid conversion |
| `trials-cancel.test.ts` | 5 | Canceling trials (immediately, end-of-cycle) |
| `trials-upgrade.test.ts` | 4 | Upgrading while in trial |
| `trials-entities.test.ts` | 4 | Entity-scoped trials |
| `trials-payment-method.test.ts` | 4 | Card required vs not required |

**Total: 27 tests**

---

## Trial Product Types

| Type | Property | Description |
|------|----------|-------------|
| Card Required | `cardRequired: true` | Customer must have PM before trial starts |
| No Card Required | `cardRequired: false` | Customer can start trial without PM |

```typescript
// Card required trial (default for proWithTrial)
const proTrial = products.proWithTrial({
  id: "pro-trial",
  items: [messagesItem],
  trialDays: 7,
  cardRequired: true,
});

// No card required trial (default for baseWithTrial)
const freeTrial = products.baseWithTrial({
  id: "free-trial",
  items: [messagesItem],
  trialDays: 14,
  cardRequired: false,
});
```

---

## Test Details

### `trials-basic.test.ts` (5 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | trial: attach product with trial | Attach proTrial | Product status = trialing, trialEndsAt correct |
| 2 | trial: features available during trial | Check entitlements during trial | All features accessible |
| 3 | trial: trial end date calculation | 7-day trial attached today | trialEndsAt = now + 7 days |
| 4 | trial: usage tracking during trial | Track usage during trial | Usage recorded, balance updated |
| 5 | trial: trial with prepaid features | Trial product with prepaid credits | Credits available during trial |

**Setup:**
```typescript
const proTrial = products.proWithTrial({
  id: "pro-trial",
  items: [messagesItem],
  trialDays: 7,
  cardRequired: true,
});

const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [proTrial] }),
  ],
  actions: [s.attach({ productId: proTrial.id })],
});

const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductTrialing({
  customer,
  productId: proTrial.id,
  trialEndsAt: addDays(new Date(), 7).getTime(),
  toleranceMs: 60_000, // 1 minute tolerance
});
```

---

### `trials-conversion.test.ts` (5 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | conversion: trial ends naturally | Advance clock past trial end | Status = active, invoice generated |
| 2 | conversion: remove trial early | Call remove trial action | Trial ends immediately, payment charged |
| 3 | conversion: trial ends without PM | No card trial ends | Product removed or checkout required |
| 4 | conversion: trial ends with failed PM | PM fails at conversion | Invoice open, action required |
| 5 | conversion: invoice amount after trial | Trial ends, verify invoice | First invoice = full price (no proration) |

**Conversion Pattern:**
```typescript
const { customerId, autumnV1, ctx } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [proTrial] }),
  ],
  actions: [s.attach({ productId: proTrial.id })],
});

// Advance past trial (7 days + buffer)
const advancedTo = await advanceToNextInvoice({
  stripeCli: ctx.stripeCli,
  testClockId: ctx.testClockId,
  currentEpochMs: addDays(new Date(), 7).getTime(),
});

// Verify conversion
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductNotTrialing({ customer, productId: proTrial.id, nowMs: advancedTo });
expectProductActive({ customer, productId: proTrial.id });
```

---

### `trials-cancel.test.ts` (5 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | cancel-trial: immediately | Cancel trial immediately | Product removed, no invoice |
| 2 | cancel-trial: end-of-cycle (trial period) | Cancel during trial | Canceling status, removed at trial end |
| 3 | cancel-trial: uncancel during trial | Cancel then uncancel | Trial restored, same end date |
| 4 | cancel-trial: usage not charged | Cancel trial with usage | No overage charged |
| 5 | cancel-trial: verify no refund | Cancel free trial | No refund invoice (nothing charged) |

**Cancel Pattern:**
```typescript
// Cancel trial immediately
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: proTrial.id,
  cancel_action: "cancel_immediately",
});

const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductNotPresent({ customer, productId: proTrial.id });

// Cancel at end of trial
await autumnV1.subscriptions.update({
  customer_id: customerId,
  product_id: proTrial.id,
  cancel_action: "cancel_end_of_cycle",
});

expectProductCanceling({ customer, productId: proTrial.id });
expectProductTrialing({ customer, productId: proTrial.id }); // Still trialing until end
```

---

### `trials-upgrade.test.ts` (4 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | upgrade-trial: trial to trial | Pro trial → Premium trial | New trial starts, original trial replaced |
| 2 | upgrade-trial: trial to paid | Trial → paid (no trial) | Trial ends, paid immediately |
| 3 | upgrade-trial: trial to free | Trial → free product | Trial ends, free product attached |
| 4 | upgrade-trial: preserve trial days | Upgrade mid-trial | Remaining trial days preserved (if configured) |

**Upgrade Pattern:**
```typescript
const proTrial = products.proWithTrial({ id: "pro-trial", items: [...], trialDays: 14 });
const premiumTrial = products.premiumWithTrial({ id: "premium-trial", items: [...], trialDays: 14 });

// Attach pro trial
await autumnV1.attach({ customer_id: customerId, product_id: proTrial.id });

// Upgrade to premium trial after 7 days
await advanceTestClock({ ... addDays(7) });
await autumnV1.attach({ customer_id: customerId, product_id: premiumTrial.id });

// Verify new trial
const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
expectProductTrialing({ customer, productId: premiumTrial.id });
expectProductNotPresent({ customer, productId: proTrial.id });
```

---

### `trials-entities.test.ts` (4 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | entity-trial: new entity starts trial | Entity1 with trial | Entity1 trialing |
| 2 | entity-trial: second entity mid-trial | Entity2 joins while Entity1 in trial | Entity2 starts own trial |
| 3 | entity-trial: entity trial conversion | Advance past entity trial end | Entity-level invoice generated |
| 4 | entity-trial: cancel one entity trial | Cancel Entity1 trial | Entity2 trial unaffected |

**Entity Pattern:**
```typescript
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true, paymentMethod: "success" }),
    s.products({ list: [proTrial] }),
    s.entities({ ids: ["entity-1", "entity-2"] }),
  ],
  actions: [
    s.attach({ productId: proTrial.id, entityId: "entity-1" }),
  ],
});

// Entity-1 trialing
const entity1 = await autumnV1.entities.get<ApiEntityV0>(customerId, "entity-1");
expectProductTrialing({ customer: entity1, productId: proTrial.id });

// Entity-2 not attached yet
const entity2 = await autumnV1.entities.get<ApiEntityV0>(customerId, "entity-2");
expect(entity2.products.length).toBe(0);
```

---

### `trials-payment-method.test.ts` (4 tests)

| # | Test Name | Scenario | Key Assertions |
|---|-----------|----------|----------------|
| 1 | pm-trial: card required - no PM | Attach cardRequired trial without PM | Error or checkout required |
| 2 | pm-trial: card required - with PM | Attach cardRequired trial with PM | Trial starts successfully |
| 3 | pm-trial: no card required - start | Attach no-card trial without PM | Trial starts without PM |
| 4 | pm-trial: no card required - conversion | No-card trial ends | Checkout required to continue |

**Payment Method Pattern:**
```typescript
// Card required - needs PM
const cardRequiredTrial = products.proWithTrial({
  items: [...],
  trialDays: 7,
  cardRequired: true,
});

// No card required - no PM needed
const noCardTrial = products.baseWithTrial({
  items: [...],
  trialDays: 7,
  cardRequired: false,
});

// Without PM - cardRequired fails, noCard succeeds
const { customerId, autumnV1 } = await initScenario({
  setup: [
    s.customer({ testClock: true }), // No payment method
    s.products({ list: [cardRequiredTrial, noCardTrial] }),
  ],
});

// This should require checkout or fail
const result1 = await autumnV1.attach({
  customer_id: customerId,
  product_id: cardRequiredTrial.id,
});
expect(result1.checkout_url).toBeDefined();

// This should succeed
await autumnV1.attach({
  customer_id: customerId,
  product_id: noCardTrial.id,
});
```

---

## Key Utilities

**Product Fixtures:**
```typescript
products.proWithTrial({ items, trialDays, cardRequired })
products.premiumWithTrial({ items, trialDays, cardRequired })
products.baseWithTrial({ items, trialDays, cardRequired })
products.defaultTrial({ items, trialDays, cardRequired })
```

**Expectation Helpers:**
```typescript
expectProductTrialing({
  customer,
  productId,
  trialEndsAt,      // Expected trial end timestamp
  toleranceMs,      // Tolerance for date comparison (default 60000)
});

expectProductNotTrialing({
  customer,
  productId,
  nowMs,            // Current time to compare against
});
```

**Test Clock Advancement:**
```typescript
// Advance to end of trial
await advanceTestClock({
  stripeCli,
  testClockId,
  advanceTo: addDays(new Date(), trialDays).getTime(),
  waitForSeconds: 30,
});

// Or use advanceToNextInvoice for full cycle
await advanceToNextInvoice({
  stripeCli,
  testClockId,
  currentEpochMs,
});
```
