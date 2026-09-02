# Concepts

Autumn is a database for your application billing state: features, plans, customers, subscriptions, purchases, balances, flags, and billing controls. It helps you iterate on pricing, manage credit access and usage, control overage, and keep billing behavior connected to product access.

Autumn is a layer above Stripe; Stripe still handles subscription management, invoicing, and payment processing. Autumn provisions and updates Stripe subscriptions, schedules, invoices, and related billing objects for you.

## Object graph

```txt
Organization
- features[] -> Feature
- plans[] -> Plan
- customers[] -> Customer

Configuration model:
Feature
- referenced by -> Plan Item
- credit_system type: maps actions to credit costs (flat or tiered)

Plan
- items[] -> Plan Item
  - feature_id -> Feature
  - optional price -> usage_based or prepaid feature price
- price -> base recurring or one-off price
- versions[] -> parallel definitions of this plan; ONE is active
- variants[] -> Plan (a derived plan storing only its differences)
- licenses[] -> Plan (a seat plan this plan hands out per seat)
- aliases -> old plan ids that still resolve after a rename

Plan Item
- feature_id -> Feature
- optional price -> usage_based or prepaid feature price
- pooled? -> entity grants combine into one shared customer balance

Runtime model:
Customer
- subscriptions[] -> Subscription -> Plan (a specific version of it)
- purchases[] -> Purchase -> Plan
- balances[feature_id] -> Balance -> Feature
  - pooled balance: fed by entity grants, spent by any entity
  - rollover, expiry, usage windows live here
- license pools[license] -> seats granted / assigned / remaining
- flags[feature_id] -> Flag -> Feature
- billing_controls -> customer-level usage controls
- entities[] -> Entity -> same runtime shape scoped under Customer

Entity
- belongs to -> Customer
- subscriptions[] -> Subscription -> Plan
- purchases[] -> Purchase -> Plan
- balances[feature_id] -> Balance -> Feature
- flags[feature_id] -> Flag -> Feature
- license assignment -> holds one seat from the customer's pool

From config to customer state:
Plan + Customer --billing.attach--> Subscription or Purchase
Plan + Customer + entity_id --billing.attach--> Entity-scoped Subscription or Purchase
Parent plan's licenses --licenses.attach--> seat assigned to an Entity
Subscription/Purchase -> Balance or Flag provisioning
```

Two relationships changed recently — worth stating plainly because older docs describe the old way:

**Versions are groups of customers, not history.** A plan's versions used to be numbered steps in time, and the newest was always live. Now each version is a definition that some group of customers lives on, and one version is marked **active** — the one new customers get. You promote a version to active deliberately, when it's ready. Why it works this way: change a plan for *everyone* (say, add a feature to all versions) and that's an edit, not a new version. Change the terms so existing customers keep the old deal (say, raise the base price) and that's a new version — the old customers stay on theirs. Non-active versions are also how you stage plans during a migration from another billing setup.

**Plans connect to other plans.** A plan can have variants (an annual twin storing only its differences), and it can offer licenses (a small seat plan it hands out per seat). So plans form a graph, not a flat list.

Use these definitions as the mental model when designing or changing Autumn
pricing. Reason in terms of features, plans, plan items, customers/entities, and
billing controls before writing any config or calling the API — most modeling
mistakes come from conflating a feature with a plan item, or a plan-level price
with a per-feature price.

## Definitions

Load the matching definition when reasoning about that object.

### Feature

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
- A schema entry's cost can be flat (`credit_cost`) or a graduated rate card: `tier_behavior: "graduated"` with tiers, so an action costs fewer credits at higher volume. Useful for enterprise credit deals.
- `invoice_credit`: credits that appear as line items on the invoice; requires a price of exactly one currency unit per credit. Activation is currently gated — confirm before promising it.
- Direct balances always drain before credit-system balances, whatever their intervals.
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

### Plan

- Plan is the attachable package: Free, Pro, Enterprise, Credit Pack, Add-on, etc.
- A plan answers two questions: what should this customer get, and how should Autumn treat it when attached?
- Most "what they get" detail lives in `items[]`; most lifecycle behavior lives on plan-level fields.

</intro>

<relationships>

- `Plan -> Plan Item`: a plan has many items; items define feature grants, limits, prepaid packages, and overage prices.
- `Subscription -> Plan`: recurring or free plan attached to a customer or entity.
- `Purchase -> Plan`: one-off plan attached to a customer or entity.
- `Customer/Entity + Plan --billing.attach--> Subscription/Purchase`: attach turns plan configuration into customer state.
- Plans also connect to plans, both edges built on customize: a **variant** is a derived plan storing its diff from a base; a **license** is a parent's link to a child plan it hands out per seat, optionally customized per parent. See the variants section below and the Licenses concept.

</relationships>

<composition>

- Use `price` for the plan-level/base charge, such as $20/month for Pro or a one-off flat fee.
- Use `items[]` as the packaging of the plan: feature grants, seats, overages, prepaid packs, boolean access, and add-on contents.
- Common pattern: `Plan.price` is the platform/package fee; `Plan.items[]` define the packaged value and any feature-level billing.
- `price: null` does not always mean free; the plan can still be paid if its items contain usage-based or prepaid prices.
- If the pricing question is "what does this feature grant or bill?", answer it in Plan Item, not Plan.

</composition>

<plan-types>

- Recurring plan: has at least one recurring paid price or recurring lifecycle; attach creates a subscription.
- Free plan: has no paid prices; attach creates a free subscription.
- One-off plan: has at least one paid price and all paid prices are one-off; attach creates a purchase.
- One-off examples: $10 flat purchase, or $10 for 100 prepaid credits.
- If any price is monthly or yearly, e.g. $10/month, it is not a one-off plan.

</plan-types>

<default-behavior>

- `auto_enable` automatically attaches the plan when a subject is created.
- Use it for free/default access, not normal paid plans.
- Common examples: free tier, limited-time trial access plan, entity default tier.
- If multiple defaults exist across groups, Autumn can assign one default per group.
- Never use `auto_enable: true` for paid plans; `Plan.price` must be null and plan items should not contain paid prepaid or usage-based prices.

</default-behavior>

<versions>

- A plan's versions are parallel definitions that different groups of customers live on — not a timeline. One version is marked **active**; that's what new customers get.
- Versions used to be numbered steps where the newest was automatically live. That changed: now you create a version and **promote** it to active when it's ready.
- When is a change a new version? If it applies to everyone (adding a feature to all versions), it's an edit, not a version. If existing customers should keep their old terms (a base price increase with grandfathering), it's a new version — old customers stay on theirs.
- Non-active versions have a second use: staging plans during a migration from another billing setup, holding those customer groups before cutover.
- Each version has a `version_slug` (a user-facing name); renaming a slug does not create a new version.
- A plan can also have **aliases**: after a plan id rename, the old id still resolves to the plan.

</versions>

<variants>

- Variants group related plans under one base definition and store each variant's diff as `variant_details.customize`.
- `plans.list` returns a flat plan list; each variant plan points back to its base through `variant_details`.
- In `catalog.preview_update` / `catalog.update`, define or customize variants under the base plan's `plans[n].variants`.
- Updating a base plan can propagate its diff to selected variants through the catalog update flow.
- Common variant uses: billing intervals, A/B price packages, and volume ladders.
- A variant's stored diff can change the price, add or remove items, and change the trial — it cannot replace the whole item list, and a variant cannot be the default plan or have variants of its own.

Annual interval variant:

```json
{
  "variant_plan_id": "pro_annual",
  "name": "Pro Annual",
  "customize": {
    "price": { "amount": 200, "interval": "year" }
  }
}
```

A/B testing variant:

```json
{
  "variant_plan_id": "pro_b",
  "name": "Pro B",
  "customize": {
    "price": { "amount": 29, "interval": "month" },
    "add_items": [{ "feature_id": "analytics" }]
  }
}
```

Metered volume variant:

```json
{
  "variant_plan_id": "pro_100k",
  "name": "Pro 100k",
  "customize": {
    "price": { "amount": 35, "interval": "month" },
    "remove_items": [
      { "feature_id": "emails", "billing_method": "usage_based" }
    ],
    "add_items": [
      {
        "feature_id": "emails",
        "included": 100000,
        "price": {
          "amount": 0.9,
          "billing_units": 1000,
          "billing_method": "usage_based",
          "interval": "month"
        }
      }
    ]
  }
}
```

</variants>

<trial-behavior>

- This covers how to MODEL trials in the catalog. For how to put a customer on a trial at attach time (card-required, no-card, revert), see the Trials concept.
- For card-required trials, put `free_trial` on the real paid plan.
- For no-card trials, prefer a separate limited-time trial plan, e.g. `pro_trial`, plus the real paid `pro` — it gives temporary access, expires automatically, and lets the user later enter the normal checkout flow for `pro`.

</trial-behavior>

<replacement-behavior>

- By default, attaching a plan replaces the customer's current plan in the same group.
- Use `group` when customers can have one active plan from each independent product line.
- Example: one `support` plan and one `sales` plan can coexist, but two `support` plans should transition.
- Groups are not needed for simple pricing with one main subscription line.

</replacement-behavior>

<add-on-behavior>

- `add_on` makes the plan additive instead of a replacement.
- Use add-ons for top-up packs, feature packs, extra concurrency, extra storage, or recurring bolt-ons.
- Add-ons can be attached alongside other add-ons; repeated attachment can be useful for top-ups or stacked purchases.
- Add-ons do not participate in normal upgrade/downgrade transitions.

</add-on-behavior>

<useful-docs>

- Concepts overview: https://docs.useautumn.com/documentation/concepts/overview
- Plans concept: https://docs.useautumn.com/documentation/concepts/plans
- Free plans: https://docs.useautumn.com/documentation/modelling-pricing/free-plans
- Recurring plans: https://docs.useautumn.com/documentation/modelling-pricing/recurring
- Trials: https://docs.useautumn.com/documentation/modelling-pricing/trials
- Add-ons: https://docs.useautumn.com/documentation/modelling-pricing/add-ons

</useful-docs>

### Plan Item

- Plan Item is the join between a Plan and a Feature.
- It defines what the customer gets for that feature, and whether usage or quantity is billed.
- Plan items turn a Feature into a customer-facing allowance, limit, prepaid package, or overage price.

**Relationships**

- `Plan -> Plan Item`: a plan has many items.
- `Plan Item -> Feature`: `feature_id` identifies the feature being granted or billed.
- `Subscription/Purchase -> Balance`: metered plan items become runtime balances when attached.
- `Subscription/Purchase -> Flag`: boolean plan items become runtime flags when attached.

## Patterns

### Included or unlimited

- Free allowance that comes with the plan.
- For consumable features, `reset` controls the cycle, e.g. 5k credits/month on Pro.
- `unlimited` means the feature is available without a tracked limit.
- For `ai_credit_system` items, `included` and the balance are in dollars (`included: 10` = $10).

### Boolean

- Pass only `feature_id`; set neither `included` nor `unlimited`. `feature_id` alone grants access.
- Grants access rather than quantity.
- Boolean plan items cannot be paid today; charge through `Plan.price` or another metered feature instead.

### Prepaid (consumable)

- Customer buys or subscribes to a consumable quantity upfront, commonly credits.
- Use for selectable monthly buckets, volume-priced buckets, one-off credit packs, and auto top-up purchase prices.
- Selectable monthly bucket example: $10 per 1k credits/month, customer chooses 5k credits for $50/month.
- Volume-priced bucket example: customer selects a monthly credit bucket whose quantity maps to a flat tier price.
- One-off credit pack example: $10 per 1k lifetime credits.
- Auto top-up example: same one-off prepaid item is purchased automatically when customer balance falls below threshold.
- The purchased quantity becomes prepaid balance and is drawn down as usage is tracked.

### Prepaid (non-consumable)

- Customer commits to a persistent quantity upfront, commonly seats or static limits.
- Quantity does not reset each cycle.
- The committed quantity is still charged every billing cycle.
- Can be used as a value the app reads and gates against, even if usage is not tracked.
- Example: concurrency limit of 10, where the app checks the allowed value but does not track consumption.
- Mid-cycle quantity changes can create prorated charges or credits.

### Usage-based (consumable)

- Customer is billed in arrears for usage beyond included units.
- Common for overage, e.g. $0.01/credit after included credits are exhausted.
- Can be tiered, e.g. 1k API calls free, then $0.02/call up to 5k, then $0.01/call after that.

### Usage-based (non-consumable)

- Customer is billed in arrears for measured persistent usage.
- Common for storage or compute capacity tracked through the cycle, e.g. $0.05/GB-month for storage used.
- Usage does not reset like consumable balance, but the billing calculation happens each cycle.
- If the quantity is only a static entitlement like concurrency, do not use usage-based pricing unless the app reports measured usage.

## Tiers

- `price.tiers` set per-bracket pricing; `tier_behavior` is `volume` or graduated (the default).
- Volume (`tier_behavior: "volume"`): tiers are `{ amount: 0, to, flat_amount }`. `to` is the cumulative TOTAL the customer gets at that tier — it includes the item's `included` free amount, not just the paid amount. The whole selected bucket is billed the tier's `flat_amount`.
- Graduated/per-unit: the customer pays `amount` per `billing_units` within each bracket, and `included` free units are added on top of what they buy.

## Composition

- A single item can combine included units with paid usage, e.g. 5k credits/month then $0.01/credit.
- A single item can combine included units with prepaid quantity, e.g. 3 seats included then $10/seat prepaid.
- The same feature can appear in multiple items when the items differ by reset interval or billing method.
- Monthly allowance plus one-off prepaid top-up item is common for auto top-ups.
- Prepaid monthly credit bucket plus usage-based overage item is valid when the same feature needs both selected quantity and overage pricing.
- For per-unit pricing with a base subscription fee, use `Plan.price` for the base fee and a Plan Item for the per-unit feature price.

## Examples

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
- Pooled entity grant:
  ```json
  { "feature_id": "AI_CREDITS", "included": 10000, "reset": { "interval": "month" }, "pooled": true, "price": null }
  ```
  On a plan attached per entity (workspace, project): each entity's 10k joins one shared customer balance that any entity — or the customer directly — can spend. Without `pooled`, each entity keeps its own separate balance.

## Advanced

- `rollover`: for consumable features with reset intervals; unused balance can carry forward subject to cap (absolute `max` or `max_percentage` of the grant) and expiry rules. Rollovers remember the originally granted amount, not just what's left.
- For paid consumable items, `price.interval` determines both the billing cycle and the reset cycle.
- `proration`: mainly relevant to prepaid quantity changes, especially non-consumable or seat-like items.
- `max_purchase`: less common cap on purchasable units; customer billing controls are often used for spend or purchase limits.
- `pooled`: on entity-attached plans, the item's grant joins one shared customer balance instead of a per-entity one (`pooled: true` on the item, in config and API alike). Rollovers on the contributing item carry into the pool. Customer-level purchases (credit packs, overage — often an add-on plan) stack beside the pool and are spendable by all entities. A per-entity cap on a pooled balance is a usage limit (billing control), not a separate balance. Not allowed on license plans.
- `entity_feature_id`: legacy/deprecated per-entity balance scoping; prefer entity-scoped plan attachments. Never mention it unless the user's config already has it.
- Auto top-ups require a one-off prepaid item for the feature; customer billing controls configure threshold and quantity.
- Balances can carry an `expires_at`; expired balances stop counting. Tracked usage can also be windowed (UTC usage windows) for time-boxed caps.

# Customize

`customize` is a patch over a catalog plan. Use it for customer-specific terms, variant definitions, plan update previews, migration drafts, and catalog update previews.

## Rules

- Base price changes go in `customize.price`.
- Plan item changes are PATCH-style: use `add_items` and `remove_items` in API params.
- Avoid full `items` replacement unless the API or config workflow specifically requires it.
- Each remove entry is a filter. Include `billing_method`, `interval`, or `interval_count` when `feature_id` alone could match multiple items.
- Taking a feature away is always `remove_items`, never an `add_items` entry with `included: 0` — that grants the feature with a zero allowance instead of withholding it, and a boolean feature has no allowance to set. "no approval chains", "without SSO", "0 seats" on a boolean all mean remove.
- Replace an item by removing the old item and adding the new one in the same patch.
- Prefer the smallest diff that preserves the plan's existing structure.
- When raising `included` on a tiered item, keep the ladder valid: every tier boundary (`to`) must be strictly greater than the new `included`. Drop or shift any boundary at or below it instead of zeroing its price.

## API examples

Change base price:

```json
{ "customize": { "price": { "amount": 50, "interval": "month" } } }
```

Add a boolean feature:

```json
{ "customize": { "add_items": [{ "feature_id": "sso" }] } }
```

Remove a feature:

```json
{ "customize": { "remove_items": [{ "feature_id": "audit_logs" }] } }
```

Change included amount:

```json
{
  "customize": {
    "remove_items": [{ "feature_id": "credits" }],
    "add_items": [{ "feature_id": "credits", "included": 5000 }]
  }
}
```

Change only the monthly item when the same feature also has a lifetime item:

```json
{
  "customize": {
    "remove_items": [
      {
        "feature_id": "credits",
        "billing_method": "prepaid",
        "interval": "month"
      }
    ],
    "add_items": [
      {
        "feature_id": "credits",
        "included": 5000,
        "reset": { "interval": "month" }
      }
    ]
  }
}
```

Change prepaid to usage-based:

```json
{
  "customize": {
    "remove_items": [{ "feature_id": "credits" }],
    "add_items": [
      {
        "feature_id": "credits",
        "included": 0,
        "price": {
          "amount": 0.01,
          "interval": "month",
          "billing_method": "usage_based"
        }
      }
    ]
  }
}
```

### Trials

- A trial gives a customer temporary, free access to a plan. It can be passed in during the billing call, or it can come with the plan configuration itself (which can be overriden).
- Set a trial with `free_trial` on attach: `{ duration_length, duration_type (day|month|year), card_required, on_end }`. Always pass `duration_type`. 
- Default to card not required (if there is no paid plan), and on_end: revert (if there is a paid plan).

If the customer the customer is NOT on a paid plan (free plan or no plan at all). 2 options:

- No-card trial (default to this): attach with `free_trial` and set `card_required` false. The subscription starts with no card and ends at trial end if none is added. While on it, the customer cannot upgrade or attach another plan until they add a card via the Stripe billing portal.
- Card-required trial: attach with `free_trial` and `card_required: true` and `long_lived_checkout` If the customer has no payment method, the attach returns a checkout URL to collect a card; they are charged when the trial ends. This should be done with a long-lived checkout URL param.

The customer already has an active (Stripe) subscription — common in sales-led trials.

- On end: revert (default to this): attach the new plan with `on_end: "revert"` . This grants the plan in Autumn without touching the Stripe subscription; at trial end Autumn moves the customer back to their original plan, preserving the existing billing cycle.
- On end: bill -- attaching a plan with a trial (or updating the subscription to add one) resets the Stripe billing anchor/cycle. This can be undesired so warn the user if they request this.
- Card required param is ignored if there is already an active sub.

Updating or ending a trial
- Call update_subscription on the trialing plan with a new `free_trial`. The duration is counted from now, not from the original start. A 14-day extension on day 10 of a 14-day trial gives 14 more days, not 4.
- Pass `free_trial: null` to end the trial immediately instead.

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
  - A pooled balance is one customer-level balance fed by entity-attached plans whose items have `pooled: true`. Every entity — and the customer — sees the same number, and any of them can spend it. Customer-level purchases (packs, overage) stack beside the pool.
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
- Pooled balances: entity-attached plans with pooled items feed one shared customer balance any entity can spend — see the pooled-balances concept.
- License seats: an entity can hold one seat from the customer's license pool — see the licenses concept.
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

### Billing Controls

- Billing controls are runtime policy on a customer or entity.
- They do not define what a plan grants; they change how usage is allowed, capped, alerted, or topped up.
- They are often exposed as customer-facing settings, except `overage_allowed` which is usually product/admin controlled.

</intro>

<control-types>

- `overage_allowed`: whether usage can continue after granted balance is exhausted. Track calls can also declare per-call behavior: `cap` (stop at the balance) or `overflow` (allow and bill the excess).
- `spend_limits`: cap overage in feature units, not dollars.
- `usage_limits`: hard usage caps over a time window; can filter on event properties.
  - Useful when a plan grants multiple balances, e.g. 5/day and 5/month, but the customer also needs a separate 100/month cap.
  - Useful for credit systems when credits are shared, but one mapped action needs its own cap, e.g. 10 `action_1` calls/day.
  - Also the right tool for a per-entity cap on a pooled (shared) balance.
- `usage_alerts`: notify when usage crosses a threshold; alerts do not block usage.
- `auto_topups`: automatically buy prepaid quantity when balance drops below a threshold. Has a purchase limit per window; repeated card failures suspend it; failures emit a `billing.auto_topup_failed` webhook. Plans can ship default billing controls that customers inherit.

</control-types>

<scope>

- Customer-level controls apply to the customer.
- Entity-level controls can override customer-level controls for that entity.
- Auto top-ups are customer-level only.

</scope>

<agent-rules>

- Inspect current customer/entity state before changing billing controls.
- For auto top-ups, verify the feature has a one-off prepaid purchase path.
- Do not describe alerts as blocking usage or spend limits as dollar limits unless the feature units are dollars.

</agent-rules>

<useful-docs>

- Billing controls: https://docs.useautumn.com/documentation/customers/billing-controls
- Auto top-ups: https://docs.useautumn.com/documentation/modelling-pricing/auto-top-ups
- Spend limits and usage alerts: https://docs.useautumn.com/documentation/modelling-pricing/spend-limits

</useful-docs>

# Licenses

A license lets a parent plan hand out another plan per seat. "Team is $40/seat, each seat gets 100 summaries" → the seat is its own plan, and the team plan offers it through a license.

## The three objects

- **Child plan** — the actual product for the child: an ordinary plan whose items are what one seat gets. It needs its own `group`, otherwise attaching it would replace its parent.
- **License** — the link plus the customized definition: the parent's `licenses: [{ license_plan_id, included }]` entry. `included` is how many seats come free with the parent. The license can also customize the child *for this parent only* — a different price, items added or removed — while the child plan itself stays shared.
- **CustomerLicense** — the runtime record per customer: how many seats they have (`granted` = included + paid), how many are assigned to entities, how many are free. Its identity (`link_id`) is stable across plan versions, so seats never jump around when plans change.

```json
{
  "plan_id": "team",
  "licenses": [
    {
      "license_plan_id": "seat",
      "included": 2,
      "customize": { "price": { "amount": 40, "interval": "month" } }
    }
  ]
}
```

## Why the license is a customization, not a copy

The child plan is defined once; each parent's license describes its own take on it. That buys three things:

- **Sharing** — Team and Enterprise can both offer `seat`, one at $40 and one at $30, without two seat plans:

```json
[
  { "plan_id": "team", "licenses": [{ "license_plan_id": "seat", "included": 2 }] },
  { "plan_id": "scale", "licenses": [{ "license_plan_id": "seat", "included": 2, "customize": { "price": { "amount": 30, "interval": "month" } } }] }
]
```

- **Propagation** — edit the child (add a boolean feature to `seat`) and the change can follow upward to every parent that offers it. Each parent chooses: follow the update, or pin its current version. A parent's own declared customize wins over what propagates.
- **Clean transitions** — a customer moving from Team to Scale, both offering `seat`: each seat assignment carries over intuitively, because the license identity is stable and both parents point at the same child.

A license's customize can change the price and add/remove items — nothing else, and licenses don't nest (a child plan can't offer licenses of its own).

## How seats move

- **Buy** — seat count is set on the *parent* (`license_quantities` on attach/update). The quantity is the total, including the free `included` seats. Buying a priced license attaches it at the customer level automatically.
- **Assign** — `licenses.attach` gives a seat to an entity (creating it if you pass a `feature_id`). Idempotent; errors when no seats are free.
- **Release** — `licenses.release` frees the seat. It does **not** change what the customer pays — they still own the seat, it's just unassigned.

Empty seats are normal — that's the point: capacity is bought before you know who fills it.

## When licenses are the right model

One question: **does a seat grant anything?** A seat that carries its own allowance or plan → license. Seats that are only a count you bill → per-unit priced item, no entities. Entities that appear one by one, each picking its own plan → attach plans per entity, no license.

## Not yet available

- Overflow billing (`prepaid_only: false` — auto-billing seats beyond the bought pool) is not available yet.
- License plans can't contain pooled items.
