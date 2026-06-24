## Plan Items

When you add a feature to a plan, you define what customers on that plan can use, and how they should be charged for it.

There are 2 types of plan features: 
- **Included Features**: features provided at no additional cost, either as a granted usage limit or a boolean flag
- **Priced Features**: features that are billed for, either as a prepaid quantity or a usage-based price. Priced features can also have an included amount.

When a customer purchases a plan, the items in the plan become [balances](/documentation/concepts/balances) under the customer.

## Included Features

#### Grant amount
For metered features, you can set a grant amount. This is how much of the feature can be used before the user hits their limit. 

When the plan is enabled for a customer, their balance for this feature will be set to the grant amount. It can either be a fixed amount, or "unlimited".

Tracking usage will decrement the feature's balance, and once it's fully consumed, checking access will return `allowed: false`.

#### Reset interval
For metered features that are `consumable`, you can also set a reset interval. This is how often the feature's balance will be reset to the grant amount.

Reset intervals can be: `no reset`, `hour`, `day`, `week`, `month`, `quarter`, `semi_annual`, or `year`. You can also customize the `interval count` to be a custom number of intervals between resets (eg, 4 hours).

`no reset` can be used to grant one-time grants that never expire. This is commonly used for top-ups or one-time purchases.

You cannot set a reset interval for `non-consumable` features (eg, seats).

#### Advanced
You can additionally configure the following properties when adding a `consumable` included feature:
- **Reset existing usage when plan is enabled**: when the plan is enabled (eg on upgrade), their usage cycle will reset, and customer's balance will be reset to full grant amount. This is `true` by default.

**Example**

You have a free plan that allows users to send 10 messages per month. A user on this plan has used 3 messages so in the current month. Then, they upgrade to a pro plan that grants 100 messages per month.

If `Reset existing usage when plan is enabled` is set to `true`, their balance will be reset to 100 messages. If it's set to `false`, the 3 messages used will be carried over, and their new balance will be 97 messages.

- **Rollovers**: configure whether granted usage should rollover to the next cycle. You can configure rollover duration, and a maximum rollover cap. Rollover balances can be retrieved from the `balances` object.

Features that are `non-consumable` have no advanced configuration options.

## Priced Features

Priced features can be used to model usage-based pricing, where the price of the product is variable and tied to how much of a feature a user consumes. This combines the configuration options of a feature with a price.

#### Grant amount
Priced features can also have an optional grant amount. This is how much of the feature can be used before being billed.

Tracking usage for a feature will first decrement the grant amount. The price will then be applied to the remaining usage.

#### Price
A feature's price consists of:
- **Price**: the price of the feature per billing units of usage, or tiered by usage
- **Billing Units**: the packages of units that the price is defined for (eg, $5 for 1000 credits)
- **Billing Interval**: how often the price is applied. This can be one-time, or recurring (eg, monthly, annually).

#### Usage model
When charging for a feature, you can choose between 2 methods:

- **Usage-based**: charge for how much of the feature is used end of billing period
- **Prepaid**: charge for a fixed quantity of the feature upfront, and draw from it as usage occurs.

#### Advanced
You can additionally configure the following properties when adding a priced feature:

- **Max purchase limit**: the maximum quantity of the feature that can be purchased. Once this limit is reached, checking access will return `allowed: false`. It includes the grant amount, if it exists.
- **Proration behavior**: for `non-consumable` features, you can choose whether to prorate the price when the quantity is increased or decreased. You can also choose whether to charge for that change immediately, or at the end of the billing period.

For priced `consumable` features, you can also set the `reset existing usage when plan is enabled` and `rollovers` properties, in the same way as included features.

Precise modeling reference with API request-body examples (the shape used by the
API and MCP, so fields are `snake_case`).

### Patterns

**Included or unlimited**

- Free allowance that comes with the plan.
- For consumable features, `reset` controls the cycle, e.g. 5k credits/month on Pro.
- `unlimited` means the feature is available without a tracked limit.
- For `ai_credit_system` items, `included` and the balance are in dollars (`included: 10` = $10).

**Boolean**

- Pass only `feature_id`; set neither `included` nor `unlimited`. `feature_id` alone grants access.
- Grants access rather than quantity.
- Boolean plan items cannot be paid today; charge through `Plan.price` or another metered feature instead.

**Prepaid — consumable**

- Customer buys or subscribes to a consumable quantity upfront, commonly credits.
- Use for selectable monthly buckets, volume-priced buckets, one-off credit packs, and auto top-up purchase prices.
- Selectable monthly bucket example: $10 per 1k credits/month, customer chooses 5k credits for $50/month.
- Volume-priced bucket example: customer selects a monthly credit bucket whose quantity maps to a flat tier price.
- One-off credit pack example: $10 per 1k lifetime credits.
- Auto top-up example: same one-off prepaid item is purchased automatically when customer balance falls below threshold.
- The purchased quantity becomes prepaid balance and is drawn down as usage is tracked.

**Prepaid — non-consumable**

- Customer commits to a persistent quantity upfront, commonly seats or static limits.
- Quantity does not reset each cycle.
- The committed quantity is still charged every billing cycle.
- Can be used as a value the app reads and gates against, even if usage is not tracked.
- Example: concurrency limit of 10, where the app checks the allowed value but does not track consumption.
- Mid-cycle quantity changes can create prorated charges or credits.

**Usage-based — consumable**

- Customer is billed in arrears for usage beyond included units.
- Common for overage, e.g. $0.01/credit after included credits are exhausted.
- Can be tiered, e.g. 1k API calls free, then $0.02/call up to 5k, then $0.01/call after that.

**Usage-based — non-consumable**

- Customer is billed in arrears for measured persistent usage.
- Common for storage or compute capacity tracked through the cycle, e.g. $0.05/GB-month for storage used.
- Usage does not reset like consumable balance, but the billing calculation happens each cycle.
- If the quantity is only a static entitlement like concurrency, do not use usage-based pricing unless the app reports measured usage.

### Tiers

- `price.tiers` set per-bracket pricing; `tier_behavior` is `volume` or graduated (the default).
- Volume (`tier_behavior: "volume"`): tiers are `{ amount: 0, to, flat_amount }`. `to` is the cumulative TOTAL the customer gets at that tier — it includes the item's `included` free amount, not just the paid amount. The whole selected bucket is billed the tier's `flat_amount`.
- Graduated/per-unit: the customer pays `amount` per `billing_units` within each bracket, and `included` free units are added on top of what they buy.

### Composition

- A single item can combine included units with paid usage, e.g. 5k credits/month then $0.01/credit.
- A single item can combine included units with prepaid quantity, e.g. 3 seats included then $10/seat prepaid.
- The same feature can appear in multiple items when the items differ by reset interval or billing method.
- Monthly allowance plus one-off prepaid top-up item is common for auto top-ups.
- Prepaid monthly credit bucket plus usage-based overage item is valid when the same feature needs both selected quantity and overage pricing.
- For per-unit pricing with a base subscription fee, use `Plan.price` for the base fee and a Plan Item for the per-unit feature price.

### Examples

- Included monthly credits:
  ```json
  { "feature_id": "AI_CREDITS", "included": 5000, "reset": { "interval": "month" }, "price": null }
  ```
- Usage-based overage after included credits:
  ```json
  { "feature_id": "AI_CREDITS", "included": 5000, "reset": { "interval": "month" }, "price": { "amount": 0.01, "interval": "month", "billing_units": 1, "billing_method": "usage_based" } }
  ```
- Tiered usage-based API calls:
  ```json
  { "feature_id": "api_calls", "included": 1000, "reset": { "interval": "month" }, "price": { "tiers": [{ "to": 5000, "amount": 0.02 }, { "to": "inf", "amount": 0.01 }], "interval": "month", "billing_units": 1, "billing_method": "usage_based" } }
  ```
  Customer gets 1k calls free, then pays tiered overage at the end of the cycle.
- Base fee plus per-unit seats:
  ```json
  { "plan_price": { "amount": 10, "interval": "month" }, "item": { "feature_id": "seats", "included": 1, "reset": null, "price": { "amount": 10, "interval": "month", "billing_units": 1, "billing_method": "usage_based" } } }
  ```
  Creates $10/month base price with 1 included seat, then $10 per additional seat.
- Prepaid selectable monthly credit bucket:
  ```json
  { "feature_id": "AI_CREDITS", "included": 5000, "reset": { "interval": "month" }, "price": { "amount": 10, "interval": "month", "billing_units": 1000, "billing_method": "prepaid" } }
  ```
  The customer passes `feature_quantities` to choose total monthly credits; quantity includes included units.
- Prepaid volume-priced bucket:
  ```json
  { "feature_id": "AI_CREDITS", "included": 5000, "reset": { "interval": "month" }, "price": { "tiers": [{ "to": 31000, "amount": 0, "flat_amount": 250 }, { "to": "inf", "amount": 0, "flat_amount": 10000 }], "tier_behavior": "volume", "interval": "month", "billing_units": 1, "billing_method": "prepaid" } }
  ```
  Use when the user selects a recurring bucket size and the bucket maps to a flat monthly price.
- One-off prepaid top-up item:
  ```json
  { "feature_id": "AI_CREDITS", "included": 0, "reset": null, "price": { "amount": 10, "interval": "one_off", "billing_units": 1000, "billing_method": "prepaid" } }
  ```
  Use for credit packs and auto top-ups; auto top-up threshold and quantity live on customer billing controls.
- Prepaid seats:
  ```json
  { "feature_id": "seats", "included": 5, "reset": null, "price": { "amount": 10, "interval": "month", "billing_units": 1, "billing_method": "prepaid" } }
  ```
  Use when the customer commits to a seat quantity upfront; mid-cycle quantity changes can prorate.
- Usage-based storage:
  ```json
  { "feature_id": "storage_gb", "included": 100, "reset": null, "price": { "amount": 0.05, "interval": "month", "billing_units": 1, "billing_method": "usage_based" } }
  ```
  Use when persistent usage is measured through the cycle and invoiced in arrears.

### Advanced

- `rollover`: for consumable features with reset intervals; unused balance can carry forward subject to cap and expiry rules.
- For paid consumable items, `price.interval` determines both the billing cycle and the reset cycle.
- `proration`: mainly relevant to prepaid quantity changes, especially non-consumable or seat-like items.
- `max_purchase`: less common cap on purchasable units; customer billing controls are often used for spend or purchase limits.
- `entity_feature_id`: legacy/deprecated per-entity balance scoping; prefer entity-scoped plan attachments.
- Auto top-ups require a one-off prepaid item for the feature; customer billing controls configure threshold and quantity.
