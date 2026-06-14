### Plan Item

<intro>

- Plan Item is the join between a Plan and a Feature.
- It defines what the customer gets for that feature, and whether usage or quantity is billed.
- Plan items turn a Feature into a customer-facing allowance, limit, prepaid package, or overage price.

</intro>

<relationships>

- `Plan -> Plan Item`: a plan has many items.
- `Plan Item -> Feature`: `feature_id` identifies the feature being granted or billed.
- `Subscription/Purchase -> Balance`: metered plan items become runtime balances when attached.
- `Subscription/Purchase -> Flag`: boolean plan items become runtime flags when attached.

</relationships>

<patterns>

  <included-or-unlimited>

  - Free allowance that comes with the plan.
  - For consumable features, `reset` controls the cycle, e.g. 5k credits/month on Pro.
  - `unlimited` means the feature is available without a tracked limit.

  </included-or-unlimited>

  <boolean>

  - Pass only `feature_id`; set neither `included` nor `unlimited`. `feature_id` alone grants access.
  - Grants access rather than quantity.
  - Boolean plan items cannot be paid today; charge through `Plan.price` or another metered feature instead.

  </boolean>

  <prepaid>

    <consumable>

    - Customer buys or subscribes to a consumable quantity upfront, commonly credits.
    - Use for selectable monthly buckets, volume-priced buckets, one-off credit packs, and auto top-up purchase prices.
    - Selectable monthly bucket example: $10 per 1k credits/month, customer chooses 5k credits for $50/month.
    - Volume-priced bucket example: customer selects a monthly credit bucket whose quantity maps to a flat tier price.
    - One-off credit pack example: $10 per 1k lifetime credits.
    - Auto top-up example: same one-off prepaid item is purchased automatically when customer balance falls below threshold.
    - The purchased quantity becomes prepaid balance and is drawn down as usage is tracked.

    </consumable>

    <non-consumable>

    - Customer commits to a persistent quantity upfront, commonly seats or static limits.
    - Quantity does not reset each cycle.
    - The committed quantity is still charged every billing cycle.
    - Can be used as a value the app reads and gates against, even if usage is not tracked.
    - Example: concurrency limit of 10, where the app checks the allowed value but does not track consumption.
    - Mid-cycle quantity changes can create prorated charges or credits.

    </non-consumable>

  </prepaid>

  <usage-based-consumable>

  - Customer is billed in arrears for usage beyond included units.
  - Common for overage, e.g. $0.01/credit after included credits are exhausted.
  - Can be tiered, e.g. 1k API calls free, then $0.02/call up to 5k, then $0.01/call after that.

  </usage-based-consumable>

  <usage-based-non-consumable>

  - Customer is billed in arrears for measured persistent usage.
  - Common for storage or compute capacity tracked through the cycle, e.g. $0.05/GB-month for storage used.
  - Usage does not reset like consumable balance, but the billing calculation happens each cycle.
  - If the quantity is only a static entitlement like concurrency, do not use usage-based pricing unless the app reports measured usage.

  </usage-based-non-consumable>

</patterns>

<composition>

- A single item can combine included units with paid usage, e.g. 5k credits/month then $0.01/credit.
- A single item can combine included units with prepaid quantity, e.g. 3 seats included then $10/seat prepaid.
- The same feature can appear in multiple items when the items differ by reset interval or billing method.
- Monthly allowance plus one-off prepaid top-up item is common for auto top-ups.
- Prepaid monthly credit bucket plus usage-based overage item is valid when the same feature needs both selected quantity and overage pricing.
- For per-unit pricing with a base subscription fee, use `Plan.price` for the base fee and a Plan Item for the per-unit feature price.

</composition>

<examples>

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

</examples>

<advanced>

- `rollover`: for consumable features with reset intervals; unused balance can carry forward subject to cap and expiry rules.
- For paid consumable items, `price.interval` determines both the billing cycle and the reset cycle.
- `proration`: mainly relevant to prepaid quantity changes, especially non-consumable or seat-like items.
- `max_purchase`: less common cap on purchasable units; customer billing controls are often used for spend or purchase limits.
- `entity_feature_id`: legacy/deprecated per-entity balance scoping; prefer entity-scoped plan attachments.
- Auto top-ups require a one-off prepaid item for the feature; customer billing controls configure threshold and quantity.

</advanced>

<useful-docs>

- Concepts overview: https://docs.useautumn.com/documentation/concepts/overview
- Plan items concept: https://docs.useautumn.com/documentation/concepts/plan-items
- Prepaid pricing: https://docs.useautumn.com/documentation/modelling-pricing/prepaid-pricing
- Usage-based pricing: https://docs.useautumn.com/documentation/modelling-pricing/usage-based-pricing
- One-off purchases: https://docs.useautumn.com/documentation/modelling-pricing/one-off-purchases
- Auto top-ups: https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups
- Rollovers: https://docs.useautumn.com/documentation/modelling-pricing/rollovers
- Volume-based tiers: https://docs.useautumn.com/documentation/modelling-pricing/volume-based-tiers
- Per-unit pricing: https://docs.useautumn.com/documentation/modelling-pricing/per-unit-pricing

</useful-docs>
