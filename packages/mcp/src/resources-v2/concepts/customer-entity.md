### Customer and Entity

<intro>

- Customer is the parent billing subject: usually a user, account, workspace, or organization.
- Entity is a child subject under a customer: usually a seat, user, project, workspace, or sub-account.
- Both expose runtime billing state: subscriptions, purchases, balances, flags, and supported billing controls.
- Features, Plans, and Plan Items are configuration; Customer and Entity show what configuration became for one subject.

</intro>

<shared-shape>

- `subscriptions[]`: recurring or free attached plans, including active and scheduled records.
- `purchases[]`: one-off attached plans, top-ups, credit packs, or lifetime/expiring purchases.
- `balances[feature_id]`: metered or credit-system feature state keyed by feature ID.
- `flags[feature_id]`: boolean feature access keyed by feature ID.
- `billing_controls`: runtime controls for usage, overage, alerts, and top-ups where supported.

</shared-shape>

<relationships>

- `Customer -> Entity`: a customer can own many entities.
- `Customer/Entity -> Subscription -> Plan`: recurring or free plan attachment.
- `Customer/Entity -> Purchase -> Plan`: one-off plan attachment.
- `Customer/Entity -> Balance -> Feature`: metered feature runtime state.
- `Customer/Entity -> Flag -> Feature`: boolean feature runtime access.
- `Customer -> processors/payment records`: external processor state such as Stripe customer IDs.

</relationships>

<subscriptions>

- Subscriptions are attached recurring or free plans.
- `status` distinguishes active from scheduled records in the same array.
- `plan_id` identifies the attached plan; `plan` appears only when expanded.
- `add_on` means the plan is additive, not replacing the main plan in its group.
- `auto_enable` means the plan was attached automatically as default access.
- `past_due`, `canceled_at`, `expires_at`, `trial_ends_at`, and `current_period_*` describe lifecycle and billing period state.
- `scope` can identify whether the subscription is customer-level or entity-level.

</subscriptions>

<purchases>

- Purchases are one-off attached plans, such as top-up packs, lifetime credit packs, or one-off add-ons.
- Purchases can provision balances or flags just like subscriptions.
- `expires_at: null` means no expiry; a timestamp means the purchase is temporary.
- `quantity` is the purchased plan quantity, not necessarily the current remaining balance.
- `scope` can identify whether the purchase is customer-level or entity-level.

</purchases>

<balances>

- Balances are the runtime state for metered and credit-system features.
- They are keyed by `feature_id`; use `balances["credits"]` or `balances["api_calls"]` to inspect one feature.
- The parent balance is an aggregate over one or more balance sources for the same feature.
- `granted` is total included plus prepaid grant, including rollover grants when present.
- `remaining` is what can still be used.
- `usage` is what has been consumed in the current period.
- `unlimited` means the feature is available without a tracked limit.
- `overage_allowed` means usage can continue past the granted balance.
- `next_reset_at` is the next reset timestamp, or null for non-resetting/lifetime balances.
- `rollovers[]` are unused consumable balances carried forward from prior periods.

</balances>

<balance-breakdown>

- `breakdown[]` explains where the aggregate balance came from.
- Common sources: base plan allowance, add-on, prepaid credit pack, auto top-up, standalone/manual grant.
- Each breakdown item can have its own `plan_id`, grant, usage, remaining amount, reset, price, and expiry.
- Use `breakdown[]` when a feature has stacked balances from multiple plans, add-ons, or top-ups.
- `included_grant` is free allowance from the source.
- `prepaid_grant` is quantity bought upfront from the source.
- `price` appears when the source has feature-level billing.
- Shorter reset intervals are normally consumed before longer/lifetime balances.

</balance-breakdown>

<flags>

- Flags are runtime access for boolean features.
- Boolean features appear in `flags`, not `balances`.
- `plan_id` shows the source plan when the flag came from a plan.
- `expires_at` shows when temporary boolean access ends.
- Use `expand: ["flags.feature"]` when the full feature object is needed.

</flags>

<customer-vs-entity-scope>

- Customer-level state belongs to the parent customer.
- Entity-level state belongs to one specific entity under the customer.
- Customer-level check/track calls do not inherit entity-level subscriptions, purchases, balances, or flags.
- Entity-level check/track calls can use customer-level state plus matching entity-level state.
- If a feature is granted only at entity level, include `entity_id` when checking or tracking it.
- If all entities share the same allowance, model the allowance at customer level and omit `entity_id` for shared usage.

</customer-vs-entity-scope>

<entity-patterns>

- Entity-level balances: one customer subscription grants per-entity limits, useful when all entities get the same features and limits.
- Entity-level subscriptions: attach plans with `entity_id`, useful when each entity can have its own tier.
- Entity-level controls can override customer-level controls for that entity where supported.
- Auto top-ups are customer-level controls, not entity-level controls.

</entity-patterns>

<billing-controls>

- Billing controls belong in the Billing Controls card.
- On the customer/entity card, only remember that controls can change usage behavior after balances are provisioned.
- Controls affect `check`, `track`, overage behavior, spend caps, usage caps, alerts, and top-up purchases.

</billing-controls>

<identity-and-payment>

- `id` is the user's customer identifier and should be used in future API calls.
- `name`, `email`, and `metadata` are identifying context.
- `fingerprint` helps deduplicate customers and prevent trial abuse.
- `stripe_id` and `processors` link Autumn state to external payment processor records.
- Stripe customers are usually created lazily when a billing operation needs one.

</identity-and-payment>

<expansion>

- Use `expand: ["subscriptions.plan"]` to inspect attached plan definitions.
- Use `expand: ["purchases.plan"]` to inspect one-off purchase definitions.
- Use `expand: ["balances.feature"]` to inspect metered feature definitions.
- Use `expand: ["flags.feature"]` to inspect boolean feature definitions.
- Use `expand: ["entities"]` to include child entities.
- Use `expand: ["invoices"]` or `expand: ["payment_method"]` when payment context is needed.
- Use `expand: ["billing_controls.auto_topups.purchase_limit"]` to include auto top-up limit runtime state.

</expansion>

<useful-docs>

- Creating customers: https://docs.useautumn.com/documentation/customers/creating-customers
- Managing customers: https://docs.useautumn.com/documentation/customers/managing-customers
- Entities: https://docs.useautumn.com/documentation/customers/feature-entities
- Balances concept: https://docs.useautumn.com/documentation/concepts/balances
- Subscriptions concept: https://docs.useautumn.com/documentation/concepts/subscriptions
- Checking access: https://docs.useautumn.com/documentation/customers/check
- Tracking usage: https://docs.useautumn.com/documentation/customers/tracking-usage

</useful-docs>
