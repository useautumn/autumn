### Billing Controls

<intro>

- Billing controls are runtime policy on a customer or entity.
- They do not define what a plan grants; they change how usage is allowed, capped, alerted, or topped up.
- Use billing controls when the user asks about overage, spend caps, usage caps, alerts, or automatic credit replenishment.

</intro>

<relationships>

- `Customer -> billing_controls`: customer-level usage policy.
- `Entity -> billing_controls`: entity-level policy where supported.
- `Billing Controls -> Balance`: controls can change whether a balance can go negative, when usage stops, or when top-ups happen.
- `Auto Top-up -> Purchase -> Balance`: auto top-up buys a one-off prepaid item and adds prepaid balance.

</relationships>

<overage-allowed>

- `overage_allowed` answers whether usage can continue past the granted balance.
- Usage-based plan items allow overage by default because overage is billed.
- Included or prepaid-only items usually block at zero unless overage is explicitly allowed.
- `enabled: true` lets usage continue past balance even without automatic overage pricing.
- `enabled: false` blocks overage even if the plan item would normally allow it.
- This control is evaluated before spend limits matter.

</overage-allowed>

<spend-limits>

- `spend_limits` cap how much overage can accumulate for a feature.
- The limit is measured in feature units, not dollars.
- Example: 1k API calls included plus `overage_limit: 5000` means the customer can use up to 6k calls total.
- Spend limits are useful for per-customer caps on usage-based features.
- If both plan-level `max_purchase` and customer spend limit exist, the customer spend limit is the per-customer override.

</spend-limits>

<usage-limits>

- `usage_limits` are hard caps over a time window.
- Use them when the user wants a fixed maximum usage per interval, independent of normal balance reset behavior.
- Response objects can include current window `usage`.
- Only one usage limit entry is allowed per `feature_id`.

</usage-limits>

<usage-alerts>

- `usage_alerts` notify when usage crosses a threshold.
- Alerts do not block usage.
- `threshold_type: "usage"` means an absolute usage count.
- `threshold_type: "usage_percentage"` means a percentage of included allowance.
- Alerts are useful for warning customers before they exhaust allowance or hit overage.

</usage-alerts>

<auto-topups>

- `auto_topups` automatically buy prepaid quantity when a balance drops below a threshold.
- Auto top-ups require a one-off prepaid plan item for the feature.
- The customer needs a payment method or compatible invoicing setup.
- `threshold` is the remaining balance that triggers the purchase.
- `quantity` is the amount purchased each time.
- `purchase_limit` caps how many top-ups can happen in a time window.
- Use `expand: ["billing_controls.auto_topups.purchase_limit"]` to inspect runtime count and next reset.
- Auto top-ups are customer-level controls, not entity-level controls.

</auto-topups>

<customer-vs-entity-controls>

- Customer-level controls apply to the customer.
- Entity-level controls can override customer-level controls for that entity.
- Entity-level controls support overage allowed, spend limits, usage limits, and usage alerts.
- Auto top-ups are customer-level only.
- When debugging entity usage, inspect both the customer controls and the matching entity controls.

</customer-vs-entity-controls>

<agent-rules>

- For any request to change billing controls, inspect the current customer or entity first.
- Preview or summarize the intended effect before applying a write.
- Do not describe alerts as blocking usage.
- Do not describe spend limits as dollar limits unless the feature units themselves are dollars.
- For auto top-ups, verify the feature has a one-off prepaid purchase path before claiming it will work.

</agent-rules>

<useful-docs>

- Billing controls: https://docs.useautumn.com/documentation/customers/billing-controls
- Auto top-ups: https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups
- Spend limits and usage alerts: https://docs.useautumn.com/documentation/modelling-pricing/spend-limits
- One-off purchases: https://docs.useautumn.com/documentation/modelling-pricing/one-off-purchases
- Checking access: https://docs.useautumn.com/documentation/customers/check
- Tracking usage: https://docs.useautumn.com/documentation/customers/tracking-usage

</useful-docs>
