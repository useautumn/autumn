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
- `ai_credit_system`: a monetary (dollar) balance for AI/LLM token usage, priced from Models.dev model pricing + a configured markup.

</types>

<credit-systems>

- Classic `credit_system`: one shared balance for several metered features; `credit_schema` maps each `metered_feature_id` to a `credit_cost`. Track via the underlying `feature_id`.
- `ai_credit_system`: a monetary balance (units = dollars) for AI/LLM token usage; no `credit_schema`. Cost = Models.dev model pricing + markup.
  - Markups, low to high priority: `default_markup` (global %), `provider_markups` (keyed by the model id's provider prefix), `model_markups` (per model). No markup = Models.dev base cost; `-100` = free (recorded, not deducted).
  - Model ids are `provider/model` (e.g. `anthropic/claude-opus-4-5`, `openrouter/anthropic/...`, `custom/...`). Standard models auto-price from Models.dev; `custom/...` models must set `input_cost`/`output_cost` ($/M tokens) and bill input/output only.
  - Track usage with `trackTokens` (modelId + token counts); Autumn converts to dollars and deducts.

</credit-systems>

<feature-rules>

- Do not create duplicate features for the same resource; use Plan Items to vary allowance, interval, package, or price.
- Example: `tokens` should be one feature, not separate `monthly_tokens` and `one_time_tokens` features.

</feature-rules>

<additional>

- `event_names`: optional aliases so one `track` request can target usage for multiple features.
- `credit_schema`: classic `credit_system` only (not `ai_credit_system`); maps `metered_feature_id` to `credit_cost`.
- `archived`: deprecated config; may still exist in grandfathered plans or subscriptions.
- Legacy pricing-agent wording: `single_use` means metered consumable; `continuous_use` means metered non-consumable.

</additional>

<useful-docs>

- Concepts overview: https://docs.useautumn.com/documentation/concepts/overview
- Features concept: https://docs.useautumn.com/documentation/concepts/features
- Credit systems: https://docs.useautumn.com/documentation/modelling-pricing/credit-systems

</useful-docs>
