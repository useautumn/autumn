### Customer and Entity

- Customer and Entity are the runtime view of billing state: what plans are attached, what access exists, what usage has happened, and what billing controls apply.
- A Customer is the primary subject being billed or entitled, usually a user, account, workspace, or organization.
- Entities are optional child subjects under a customer, such as deployments, seats, users, projects, or sub-accounts.
- Depending on the org's configuration, entities may not be used at all; if they are in play, billing state can exist at both customer and entity scope.
- Features, Plans, and Plan Items define configuration; Customer and Entity show how that configuration materializes for one real subject.

</intro>

<shared-shape>

- `subscriptions[]` and `purchases[]` show which plans this customer or entity has subscribed to or bought.
- These arrays describe the join between subject and plan: status, start/end dates, expiry, schedule state, quantity, and attached plan context.
- `flags[feature_id]` and `balances[feature_id]` show runtime feature state for this subject.
- Boolean features materialize as flags: access is on or off.
- Flag fields mostly mirror the API reference and are straightforward, so this card does not expand every field.
- Metered and credit features materialize as balances: aggregate granted, included, usage, remaining, reset timing, and related runtime details.

  <balances>

  - Balances are the runtime state for metered and credit-system features.
  - The parent balance object is an aggregate view for one feature.
  - Each breakdown item is the actual balance source: usually from attaching a plan item, or from a standalone grant created with `balances.create`.
  - Plan source shape: `Customer/Entity -> Balance Breakdown -> Plan Item`.
  - `granted` is included grant plus prepaid grant.
  - `remaining` is the positive balance left from included/prepaid grants and never goes below 0.
  - `usage` is how much has been used; if usage exceeds granted, the subject is in overage.
  - Other balance fields, such as reset timing and unlimited status, are usually self-explanatory from the API reference.

  </balances>

</shared-shape>

<customer-vs-entity-scope>

- Customer-level state belongs to the parent customer.
- Entity-level state belongs to one specific entity under the customer.
- Customer-level check/track calls do not inherit entity-level subscriptions, purchases, balances, or flags.
- Entity-level check/track calls can use customer-level state plus matching entity-level state.
- If a feature is granted only at entity level, include `entity_id` when checking or tracking it.
- If all entities share the same allowance, model the allowance at customer level and omit `entity_id` for shared usage.
- Legacy `entity_feature_id` scoped one plan item's balance across many entities under the customer; this model is deprecated.
- Prefer attaching plans at entity scope when each entity needs its own tier, balance, or subscription state.

</customer-vs-entity-scope>

<entity-patterns>

- Entity-level balances: one customer subscription grants per-entity limits, useful when all entities get the same features and limits.
- Entity-level subscriptions: attach plans with `entity_id`, useful when each entity can have its own tier.
- Entity-level controls can override customer-level controls for that entity where supported.

</entity-patterns>

<identity>

- Customer `id` and entity `id` should be identifiers from the user's own app database.
- Users do not need to store a separate Autumn-only ID for customers or entities.

</identity>

<additional>

- Billing controls can change usage behavior after balances are provisioned; see the Billing Controls section in this Concepts resource.
- Use `expand` to pull related details when needed, such as attached plans, features, entities, invoices, payment method, or billing-control runtime state.

</additional>

<useful-docs>

- Creating customers: https://docs.useautumn.com/documentation/customers/creating-customers
- Managing customers: https://docs.useautumn.com/documentation/customers/managing-customers
- Entities: https://docs.useautumn.com/documentation/customers/feature-entities
- Balances concept: https://docs.useautumn.com/documentation/concepts/balances
- Subscriptions concept: https://docs.useautumn.com/documentation/concepts/subscriptions
- Checking access: https://docs.useautumn.com/documentation/customers/check
- Tracking usage: https://docs.useautumn.com/documentation/customers/tracking-usage

</useful-docs>
