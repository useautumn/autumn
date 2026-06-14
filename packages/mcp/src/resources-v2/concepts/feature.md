### Feature

<intro>

- Feature is the atomic thing Autumn gates, tracks, or bills.
- `id` is used in plan items, check/track calls, balances, and flags.
- `name` and optional `display` labels are for dashboard and billing UI.

</intro>

<relationships>

- `Plan Item -> Feature`: defines how a plan grants or bills the feature.
- `Balance -> Feature`: runtime state for metered features.
- `Flag -> Feature`: runtime access for boolean features.

</relationships>

<types>

- `boolean`: on/off access, exposed as flags.
- `metered`, `consumable: true`: usage is spent and can reset, e.g. API calls or AI messages.
- `metered`, `consumable: false`: persistent quantity, e.g. seats or storage.
- `credit_system`: user-defined currency with credit costs for metered consumable features.

</types>

<feature-rules>

- Do not create duplicate features for the same resource; use Plan Items to vary allowance, interval, package, or price.
- Example: `tokens` should be one feature, not separate `monthly_tokens` and `one_time_tokens` features.

</feature-rules>

<additional>

- `event_names`: optional aliases so one `track` request can target usage for multiple features.
- `credit_schema`: for `credit_system` only; maps `metered_feature_id` to `credit_cost`.
- `archived`: deprecated config; may still exist in grandfathered plans or subscriptions.
- Legacy pricing-agent wording: `single_use` means metered consumable; `continuous_use` means metered non-consumable.

</additional>

<useful-docs>

- Concepts overview: https://docs.useautumn.com/documentation/concepts/overview
- Features concept: https://docs.useautumn.com/documentation/concepts/features
- Credit systems: https://docs.useautumn.com/documentation/modelling-pricing/credit-systems

</useful-docs>
