# Catalog

First read the `autumn-concepts` knowledge — it defines Autumn's data model — features, plans, plan items, balances — which every modeling decision builds on.

## Approach

- Modeling is iterative: translate the user's intended pricing into Autumn's model (features + plans + plan items). Ask clarifying questions and never assume behavior — confirm, for example, whether a paid item is usage-based or prepaid, and at what interval a metered allowance resets.
- If one ambiguity changes which other questions apply, resolve it first before asking those.
- For a new codebase-managed catalog, ask whether the user wants to use `atmn` to create, pull, preview, and push their catalog. Recommend `atmn` unless they explicitly want dashboard/API-first changes.
- For an existing project, check whether `autumn.config.ts` exists. If it does, treat it as the local catalog source and prefer `atmn`; otherwise use MCP/API tools directly or ask whether to initialize/pull config first.
- Use stable lowercase IDs with underscores (`pro_plan`, `chat_messages`).
- Never create duplicate features for one resource; vary allowance, interval, or price via plan items instead (one `tokens` feature, not `monthly_tokens` + `one_time_tokens`).
- Keep it simple to start: if there are many features, build the most important (prioritise metered ones) and confirm before adding more.

## Updating a catalog

Follow the same preview-decision-apply shape as `atmn` and the dashboard:

1. Build or edit the desired catalog shape.
2. Preview it: use `atmn` for `autumn.config.ts` projects, or `catalog.preview_update` / `plans.preview_update` for MCP/API flows.
3. Summarize feature changes first: created, updated, skipped, deleted/archived, and blocked updates.
4. For each changed base plan or plan family, surface the plan diff, customer impact, versioning choices, variants, conflicts, and migration option.
5. If the user changes any decision, revise the config or params and preview again.
6. Apply only the exact previewed update, following the global write approval rules for `catalog.update`, `plans.update`, or `atmn --headless push --yes`.

For plan families with customers or variants, ask decisions in this order:

1. Versioning: create a new version, update the current version with `disable_version: true`, update all versions with `all_versions: true`, or skip.
2. Variants: inspect `plan.variants[n].update_source`. `propagated` variants need a propagation choice; `direct` variants are being updated like their own plan and may need their own versioning and migration decisions.
3. Migration: whether to create a migration draft to move existing customers onto the new plan shape.

## Rules

- Never give a default/auto-enabled plan a paid price: its base price must be null and its items must not contain paid prepaid or usage-based prices.
- Per-unit pricing (e.g. "$X per seat") always pairs a base fee on `Plan.price` with a per-unit plan item — never a bare per-unit price with no base.
- Use variants for named derivatives of a base plan: annual/monthly intervals, A/B price packages, or different volume ladders.
- Ignore "Enterprise"/custom plans here — those are created per-customer in the dashboard.

## Catalog operations

# Catalog update flow

Use this when changing an existing Autumn catalog through MCP/API or when mapping an `atmn push` preview back to tool params. For a single plan edit, use the same flow with `plans.preview_update` and `plans.update`.

## Loop

1. Inspect the current catalog and the proposed catalog.
2. Build `catalog.preview_update` params: `features`, `plans`, optional `skip_deletions`, `skip_feature_ids`, `skip_plan_ids`, `expand`.
3. Run `catalog.preview_update`; never skip this before a write.
4. Summarize the preview and ask for decisions per feature and per base plan family.
5. Revise params or config based on the decisions, then preview again if anything changed.
6. Run `catalog.update` with the exact previewed params, following the global write approval rules.

For `plans.preview_update`, include `include_versions: true` and `include_variants: true` when the plan has customers, historical versions, or variants so the user can choose the right scope. `catalog.preview_update` accepts the same per-plan detail flags inside each plan in `plans[]`.

## Preview summary checklist

- Feature changes: created, updated, skipped, removed, archived, and any blockers.
- Plan changes: created, updated, deleted, skipped, unchanged, and whether deletion archives because customers exist.
- For each changed plan: `customize`, `price_change`, `item_changes`, `previous_attributes`, `has_customers`, `customer_count`, and `versionable`.
- Variants: affected variant IDs, `will_apply`, `plan.variants[n].update_source` (`direct` vs `propagated`), conflicts, and whether selected variants have customers.
- Other versions: historical versions that can receive the same diff.
- Migration: whether preview returned a draft, which plan IDs it covers, whether it includes custom plans, and whether billing changes exist.

## Per-plan family decisions

For each changed base plan or plan family, ask decisions in the same order as the dashboard:

1. Versioning strategy.
2. Variant handling: propagation choices for `propagated` variants, standalone update choices for `direct` variants.
3. Migration draft.

### Versioning

Use `versionable`, `has_customers`, `customer_count`, and `other_versions` to explain why this matters.

- Create new version: omit `disable_version`; existing customers remain on their current version.
- Update current version: send `disable_version: true`; existing customers keep their rows unless a migration draft is created and run.
- Update all versions: send `all_versions: true`; do not combine with `disable_version`.
- Force a new version even without customers only when the user explicitly asks: `force_version: true`.
- Skip a plan by adding its ID to `skip_plan_ids`, then preview again.

`create_version` is usually the safest live choice because it grandfathers existing customers. `update_current` and `update_all_versions` patch existing versions, so they may need a migration draft if customers should move to the new shape.

### Variant propagation

- `update_variant_ids` propagates the base plan diff to selected variant plan IDs.
- `variants` contains direct variant updates or new variant definitions under the base plan.
- If `plan.variants[n].update_source` is `propagated`, the variant would receive the base plan diff. Show its ID/name, customer impact, item/price changes, and conflicts, then ask whether to include it in `update_variant_ids`.
- Default to selecting conflict-free propagated variants only. Ask explicitly before propagating into variants with conflicts.
- If `plan.variants[n].update_source` is `direct`, treat it like updating that variant plan itself. It can have its own `create_version` / `update_current` choice and its own migration draft question when it has customers.
- Variants cannot use `update_all_versions` in atmn headless mode.

### Migration

If updating in place or all versions and the user wants affected customers moved, include `migration: { "draft": true }`. Add `include_custom: true` only when the user explicitly wants custom plan versions included.

Migration drafts do not move customers by themselves. The returned migration must be reviewed/run separately.

## Dashboard plan edit flow

Mirror the dashboard's `PlanChangeDialog` when asking a human:

1. Review the backend preview: price, item, trial, billing control, and settings changes.
2. Choose strategy: create a new version, update the current version, or update all versions.
3. Choose variant propagation when variants exist; default to conflict-free variants only.
4. Review migration targets. If customers should move, create a migration draft and send the user to run/review it.
5. Apply the write with the exact previewed params, following the global write approval rules.

Metadata-only edits apply across all versions and variants. A past version cannot create a new version from the dashboard flow; update that version or all versions instead.

## API param mapping

```json
{
  "plan_id": "pro",
  "price": { "amount": 29, "interval": "month" },
  "items": [],
  "disable_version": true,
  "update_variant_ids": ["pro_annual"],
  "migration": { "draft": true }
}
```

- New version: remove `disable_version`, `all_versions`, and `migration` unless explicitly needed.
- Update current version: set `disable_version: true`.
- Update all versions: set `all_versions: true`; remove `disable_version`.
- Propagate to variants: set `update_variant_ids` to the selected variant plan IDs.
- Directly update variants: include `variants[]` under the base plan.
- Migration draft: set `migration: { "draft": true }` on the plan, or use top-level catalog `migration` only when every relevant plan should share it.
- Skip a plan or variant: add its ID to `skip_plan_ids`.

Direct variant migration drafts cannot be mixed with incompatible direct variant updates; follow the preview/tool error and split the work if needed.

## catalog.update ordering

`catalog.update` applies features first, then plans, then missing plan removals, then missing feature removals. With `skip_deletions: false`, missing plans/features are removed; customer-bearing plans are archived instead of deleted.

`catalog.preview_update` previews feature writes first and then plan writes, so plan previews can reference features created in the same catalog update. `catalog.update` follows the same ordering.

# atmn catalog flows

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth.

## When to use it

- New project: ask whether to use `atmn` to build and push the catalog. Recommend it for code-managed catalogs.
- Existing project: if `autumn.config.ts` exists, inspect and edit it before pushing.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## Config shapes

`autumn.config.ts` uses the atmn package types, not raw API JSON. Field names are camelCase: `featureId`, `billingMethod`, `billingUnits`, `freeTrial`, `addItems`, `removeItems`, `intervalCount`. Follow the exported types from the package when editing config.

Core builders:

```ts
const messages = feature({
  id: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

const messagesItem = item({
  featureId: messages.id,
  included: 10000,
  reset: { interval: "month" },
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: { amount: 20, interval: "month" },
  items: [messagesItem],
});

export const proAnnual = pro.variant({
  id: "pro_annual",
  name: "Pro Annual",
  customize: {
    price: { amount: 200, interval: "year" },
  },
});
```

Usage-priced item:

```ts
item({
  featureId: messages.id,
  included: 10000,
  price: {
    amount: 0.9,
    billingMethod: "usage_based",
    billingUnits: 1000,
    interval: "month",
  },
});
```

## Headless update loop

1. Inspect or create `autumn.config.ts`.
2. Edit the config to represent the desired catalog.
3. Run `atmn --headless push` to preview changes and required decisions.
4. For each affected plan family, show the user the versioning choice, variant propagation choices/conflicts, and migration draft choice.
5. Rerun `atmn --headless push --yes` with explicit decision flags.
6. Report created/updated/deleted/archived features and plans.

If the user changes the catalog shape or any decision, edit `autumn.config.ts` or the flags and preview again before pushing.

## Decision flags

```sh
atmn --headless push --yes --plan-intents '{"pro":"create_version"}'
atmn --headless push --yes --plan-intents '{"pro":"update_current"}'
atmn --headless push --yes --plan-intents '{"pro":"update_all_versions"}'
atmn --headless push --yes --plan-intents '{"pro":"update_current_and_migrate"}'
atmn --headless push --yes --plan-intents '{"pro":"update_all_versions_and_migrate"}'
atmn --headless push --yes --migration-drafts '{"pro":true}'
atmn --headless push --yes --variant-propagations '{"pro":["pro_annual"]}'
atmn --headless push --yes --variant-propagations '{"pro":[]}'
```

`create_version` grandfathers existing customers. `update_current` edits the current version in place. `update_all_versions` applies the diff to historical versions too. The `*_and_migrate` shortcuts also choose a migration draft for current customers.

Use keys like `pro@v1` when the prompt targets a historical version. For variants, `update_all_versions` is not valid; choose `create_version` or `update_current`.

## What to show the user

- Required plan intents and whether live defaults favor creating a new version.
- Required variant propagation choices and conflicts.
- Required migration choices; drafts do not move customers until run.
- Feature/plan deletions that will archive instead because dependencies or customers exist.

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

<variants>

- Variants group related plans under one base definition and store each variant's diff as `variant_details.customize`.
- `plans.list` returns a flat plan list; each variant plan points back to its base through `variant_details`.
- In `catalog.preview_update` / `catalog.update`, define or customize variants under the base plan's `plans[n].variants`.
- Updating a base plan can propagate its diff to selected variants through the catalog update flow.
- Common variant uses: billing intervals, A/B price packages, and volume ladders.

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

## Pricing patterns

Load the matching reference when modeling that pattern.

## Usage-Based Pricing

Pay-per-use (usage-based) pricing charges customers based on how much of a feature they actually consume, billed at the end of each billing period. This is ideal for products where usage varies significantly between customers.

> **Example** <br />
> A notification service charges $1 per 1,000 notifications sent. A customer who sends 5,000 notifications in a month pays $5 at the end of that month.

## Setting up

<Tabs>
<Tab title="CLI">

Create a consumable feature with a `usage_based` price:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const notifications = feature({
  id: 'notifications',
  name: 'Notifications',
  type: 'metered',
  consumable: true,
});

export const payAsYouGo = plan({
  id: 'pay_as_you_go',
  name: 'Pay As You Go',
  group: 'main',
  items: [
    item({
      featureId: notifications.id,
      included: 1000,
      reset: { interval: 'month' },
      price: {
        amount: 1,
        interval: 'month',
        billingUnits: 1000,
        billingMethod: 'usage_based',
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create a plan
2. Add a **consumable** feature (e.g., notifications)
3. Set an optional **included** amount (free usage before charges begin)
4. Add a **price** with:
   - **Billing method**: Usage-based
   - **Amount**: price per billing unit (e.g., $1)
   - **Billing units**: the package size (e.g., 1,000 notifications)
   - **Interval**: billing frequency (e.g., monthly)
5. Save the plan

</Tab>
</Tabs>

## How it works

1. A customer's usage is tracked via the [track](/documentation/customers/tracking-usage) endpoint throughout the billing period
2. Usage first draws down from the **included** amount (if any) at no charge
3. Usage beyond the included amount is **overage** — billed at the configured rate
4. At the end of the billing period, Autumn generates a Stripe invoice for the total overage

Usage-based features allow overage by default. The `check` endpoint will return `allowed: true` even if the customer has exceeded their included balance, as long as a usage-based price is configured.

## Tracking usage

Track usage as it occurs — Autumn accumulates it over the billing period:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

await autumn.track({
  customer_id: "user_123",
  feature_id: "notifications",
  value: 500,
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

await autumn.track(
    customer_id="user_123",
    feature_id="notifications",
    value=500,
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/track" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "notifications",
    "value": 500
  }'
```

</CodeGroup>

## Checking access

Check if the customer can use the feature. For usage-based features with overage, `allowed` is `true` as long as the feature exists on the customer's plan:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.check({
  customer_id: "user_123",
  feature_id: "notifications",
});

console.log(data.allowed); // true (overage allowed)
console.log(data.balance);
```

```python Python
response = await autumn.check(
    customer_id="user_123",
    feature_id="notifications",
)

print(response.allowed)  # True (overage allowed)
print(response.balance)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "notifications"
  }'
```

</CodeGroup>

<Expandable title="check response">
```json
{
  "allowed": true,
  "customerId": "user_123",
  "balance": {
    "featureId": "notifications",
    "granted": 1000,
    "remaining": -500,
    "usage": 1500,
    "unlimited": false,
    "overageAllowed": true,
    "nextResetAt": 1757192635393
  }
}
```
</Expandable>

## Combining with free tiers

A common pattern is pairing usage-based pricing with a [free plan](/documentation/modelling-pricing/free-plans). Free users are blocked when they exceed their limit, while paying users are billed for overages.

| Plan | Over limit | Result |
|------|------------|--------|
| Free | Yes | Blocked (`allowed: false`) |
| Pay-as-you-go | Yes | Allowed, billed at end of period |

## Prepaid Pricing

Prepaid pricing lets customers pay for a fixed quantity of a feature upfront. They select how many units they want at purchase time, pay immediately, and their balance is decremented as they use it.

This is in contrast to [usage-based pricing](/documentation/modelling-pricing/usage-based-pricing), where customers are billed for actual usage at the end of a billing cycle.

> **Example** <br />
> An AI platform has a Pro plan at $20/month that includes:
> - **API Credits**: 500 included for free, then $10 per 1,000 credits per month (consumable)
> - **Seats**: 3 included for free, then $5 per seat per month (non-consumable)
>
> A customer selects 3,000 credits and 10 seats. They pay $20 base + $25 for 2,500 extra credits + $35 for 7 extra seats = $80/month.

## Setting up

<Tabs>
<Tab title="CLI">

Create your features and add them to a plan with `prepaid` prices:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const apiCredits = feature({
  id: 'api_credits',
  name: 'API Credits',
  type: 'metered',
  consumable: true,
});

export const seats = feature({
  id: 'seats',
  name: 'Seats',
  type: 'metered',
  consumable: false,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: apiCredits.id,
      included: 500,
      price: {
        amount: 10,
        billingUnits: 1000,
        billingMethod: 'prepaid',
        interval: 'month',
      },
    }),
    item({
      featureId: seats.id,
      included: 3,
      price: {
        amount: 5,
        billingMethod: 'prepaid',
        interval: 'month',
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create or edit a plan
2. Add your features:
   - A `metered`, `consumable` feature for credits (e.g., "API Credits") — set an **included** amount (500), a **price** ($10 per 1,000 per month), and billing method **Prepaid**
   - A `metered`, `non-consumable` feature for seats (e.g., "Seats") — set an **included** amount (3), a **price** ($5 per seat per month), and billing method **Prepaid**
3. Save the plan

</Tab>
</Tabs>

## How it works

When a plan has prepaid features, customers select a **quantity** at purchase time. This quantity determines:

- **How many units are granted** as their balance
- **How much they're charged**, based on the price and billing units

The `quantity` is the **total** number of feature units the customer will receive, including any included amount.

Using our example plan:
- A customer selects **3,000 API credits**. 500 are included, so they pay for 2,500 → $10 × (2,500 / 1,000) = **$25/month** for credits.
- The same customer selects **10 seats**. 3 are included, so they pay for 7 → $5 × 7 = **$35/month** for seats.

If you pass a `quantity` equal to or less than the included amount, the customer gets the included amount and pays nothing extra for that feature.

## Passing `feature_quantities`

When attaching a plan or updating a subscription that contains prepaid features, use the `feature_quantities` parameter to specify how many units the customer wants.

### Attaching a plan

Pass a `feature_quantities` entry for each prepaid feature on the plan:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.billing.attach({
  customerId: "user_123",
  planId: "pro",
  featureQuantities: [
    { featureId: "api_credits", quantity: 3000 },
    { featureId: "seats", quantity: 10 },
  ],
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.billing.attach(
    customer_id="user_123",
    plan_id="pro",
    feature_quantities=[
        { "feature_id": "api_credits", "quantity": 3000 },
        { "feature_id": "seats", "quantity": 10 },
    ],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "feature_quantities": [
      { "feature_id": "api_credits", "quantity": 3000 },
      { "feature_id": "seats", "quantity": 10 }
    ]
  }'
```

</CodeGroup>

### Updating a subscription

To change prepaid quantities on an existing subscription, use `billing.update`. For example, to add more seats mid-cycle:

<CodeGroup>

```typescript TypeScript
await autumn.billing.update({
  customerId: "user_123",
  planId: "pro",
  featureQuantities: [
    { featureId: "api_credits", quantity: 3000 },
    { featureId: "seats", quantity: 15 },
  ],
});
```

```python Python
await autumn.billing.update(
    customer_id="user_123",
    plan_id="pro",
    feature_quantities=[
        { "feature_id": "api_credits", "quantity": 3000 },
        { "feature_id": "seats", "quantity": 15 },
    ],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing/update" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "feature_quantities": [
      { "feature_id": "api_credits", "quantity": 3000 },
      { "feature_id": "seats", "quantity": 15 }
    ]
  }'
```

</CodeGroup>

See [Updating Subscriptions](/documentation/customers/updating-subscriptions) for more on previewing changes. When quantities change mid-cycle, Autumn can prorate the charge — see [Proration](/documentation/modelling-pricing/proration) for configuration options.

## Understanding prepaid balances

Once a customer is attached to a plan with prepaid features, their balance `breakdown` distinguishes between what was included for free and what was purchased.

| Field | Description |
|-------|-------------|
| `included_grant` | The amount granted by the plan for free — the "included" amount configured on the plan item. |
| `prepaid_grant` | The amount purchased via `feature_quantities` — the quantity minus the included amount. |
| `granted` | Top-level total: `included_grant + prepaid_grant` summed across all breakdown items. |
| `remaining` | How much is left to use. |
| `usage` | How much has been consumed. |

Using the plan from our setup, a customer who attaches with 3,000 credits and 10 seats will have:

```json expandable
{
  "api_credits": {
    "feature_id": "api_credits",
    "granted": 3000,
    "remaining": 3000,
    "usage": 0,
    "unlimited": false,
    "overage_allowed": false,
    "breakdown": [
      {
        "id": "cus_ent_abc123",
        "plan_id": "pro",
        "included_grant": 500,
        "prepaid_grant": 2500,
        "remaining": 3000,
        "usage": 0,
        "reset": {
          "interval": "month",
          "resets_at": 1773851121437
        },
        "price": {
          "amount": 10,
          "billing_units": 1000,
          "billing_method": "prepaid"
        },
        "expires_at": null
      }
    ]
  },
  "seats": {
    "feature_id": "seats",
    "granted": 10,
    "remaining": 10,
    "usage": 0,
    "unlimited": false,
    "overage_allowed": false,
    "breakdown": [
      {
        "id": "cus_ent_def456",
        "plan_id": "pro",
        "included_grant": 3,
        "prepaid_grant": 7,
        "remaining": 10,
        "usage": 0,
        "reset": null,
        "price": {
          "amount": 5,
          "billing_units": 1,
          "billing_method": "prepaid"
        },
        "expires_at": null
      }
    ]
  }
}
```

Use the [check](/documentation/customers/check) endpoint before allowing a customer to use a prepaid feature, and [track](/documentation/customers/tracking-usage) usage afterwards to decrement their balance.

## Prepaid vs usage-based

| | Prepaid | Usage-based |
|---|---|---|
| **When charged** | Upfront at purchase | End of billing cycle |
| **Customer selects quantity** | Yes, via `feature_quantities` | No |
| **Balance behavior** | Decremented as usage occurs | Accumulated and billed |
| **Best for** | Credits, top-ups, seat licenses | Metered APIs, storage, bandwidth |

## Volume-Based Tiers

Volume-based pricing uses tiers to determine a single flat charge based on the total usage volume. Unlike [graduated pricing](/documentation/modelling-pricing/graduated-pricing), where each tier has its own rate, volume-based pricing charges a single flat amount based on which tier the total usage falls into.

> **Example** <br />
> A data platform charges:
> - 0–1,000 records: $100 flat
> - 1,001–10,000 records: $500 flat
> - 10,001+: $1,000 flat
>
> A customer who processes 15,000 records falls into the 10,001+ tier and pays a flat **$1,000**
>
> Compare this to graduated pricing, where each tier is charged separately and summed together

## Setting up

<Tabs>
<Tab title="CLI">

Use the `tiers` array with `tierBehavior: 'volume'` on a plan item price:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const records = feature({
  id: 'records',
  name: 'Records Processed',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 50, interval: 'month' },
  items: [
    item({
      featureId: records.id,
      reset: { interval: 'month' },
      price: {
        tiers: [
          { to: 1000, flatAmount: 100 },
          { to: 10000, flatAmount: 500 },
          { to: 'inf', flatAmount: 1000 },
        ],
        tierBehavior: 'volume',
        billingMethod: 'usage_based',
        interval: 'month',
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create or edit a plan
2. Add a **consumable** feature
3. Under **Price**, select **Tiered**
4. Switch the tier behavior to **Volume**
5. Add tiers with the upper limit (`to`) and flat amount (`flat_amount`) for each range
6. Set the billing method to **Usage-based** and the billing interval
7. Save the plan

</Tab>
</Tabs>

## How volume-based pricing works

At the end of the billing period, Autumn:

1. Looks at the total usage for the feature
2. Finds the tier the total falls into
3. Charges the flat amount for that tier

| Total usage | Matching tier | Charge |
|-------------|---------------|--------|
| 500 | 0–1,000 | **$100** |
| 5,000 | 1,001–10,000 | **$500** |
| 15,000 | 10,001+ | **$1,000** |

## Tier configuration

Each tier has the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `to` | number or `"inf"` | The upper boundary of this tier |
| `flat_amount` | number | Flat fee charged when total usage falls in this tier |
| `amount` | number | Optional per-unit price applied to the total usage when this tier is the matching tier |

Tiers must be in ascending order by `to`. The final tier should use `"inf"`.

## Combining flat and per-unit amounts

Each tier can include both `flat_amount` and `amount` — a fixed fee plus a per-unit charge when that tier is the matching tier. This is useful for combining a base fee with per-unit volume pricing.

```ts
price: {
  tiers: [
    { to: 1000, amount: 0.10, flat_amount: 0 },
    { to: 10000, amount: 0.08, flat_amount: 50 },
    { to: 'inf', amount: 0.05, flat_amount: 100 },
  ],
  tierBehavior: 'volume',
  billingMethod: 'usage_based',
  interval: 'month',
}
```

A customer with 5,000 records would pay: (5,000 × $0.08) + $50 = **$450**

## Graduated vs volume-based

| | Graduated | Volume-based |
|---|-----------|--------------|
| **Rate applied** | Each tier at its own rate | Single flat amount for the matching tier |
| **Total charge** | Sum of each tier's charge | Flat amount of the matching tier |
| **Best for** | Rewarding growth with lower marginal rates | Simpler pricing with volume discounts |

See [Graduated Pricing](/documentation/modelling-pricing/graduated-pricing) for the alternative model.

## Per-Unit Pricing

Per-unit pricing charges customers based on the quantity of a resource they use — seats, workspaces, environments, or any other non-consumable feature. Customers either commit to a quantity upfront (prepaid) or are billed based on actual usage at the end of each billing cycle (usage-based).

> **Example** <br />
> A collaboration tool charges $10/seat/month. The plan includes 5 seats for free, and each additional seat costs $10.

## Setting up

<Tabs>
<Tab title="CLI">

Create a `non-consumable` metered feature and add it to a plan with a per-unit price:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const seats = feature({
  id: 'seats',
  name: 'Seats',
  type: 'metered',
  consumable: false,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: seats.id,
      included: 5,
      price: {
        amount: 10,
        interval: 'month',
        billingMethod: 'usage_based',
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create or edit a plan
2. Add a `metered`, `non-consumable` feature (e.g., "Seats")
3. Set an **included** amount (e.g., 5 seats for free)
4. Add a **price** per unit (e.g., $10 per seat per month)
5. Choose the **billing method**:
   - **Prepaid** — customer selects quantity at checkout, charged upfront
   - **Usage-based** — billed for actual usage at end of billing cycle
6. Under **Advanced**, configure [proration](/documentation/modelling-pricing/proration) behavior for mid-cycle changes
7. Save the plan

</Tab>
</Tabs>

## Billing methods

| Method | When charged | Quantity | Best for |
|--------|-------------|----------|----------|
| **Prepaid** | Upfront at purchase | Customer selects a fixed quantity | Seat licenses with committed counts |
| **Usage-based** | End of billing cycle (prorated on changes) | Automatic — tracks actual usage | Seats that fluctuate frequently |

### Prepaid per-unit

With prepaid, the customer selects a **total quantity** when purchasing. The `quantity` includes any free included amount — Autumn subtracts the included amount and charges for the remainder.

For example, with 5 included seats at $10/extra seat, a customer who selects `quantity: 10` gets 10 seats total and pays for 5 extra seats ($50/month).

Pass the quantity via `featureQuantities`:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.billing.attach({
  customerId: "user_123",
  planId: "pro",
  featureQuantities: [{
    featureId: "seats",
    quantity: 10,
  }],
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.billing.attach(
    customer_id="user_123",
    plan_id="pro",
    feature_quantities=[{
        "feature_id": "seats",
        "quantity": 10,
    }],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "feature_quantities": [{
      "feature_id": "seats",
      "quantity": 10
    }]
  }'
```

</CodeGroup>

The customer's balance is set to the total quantity (10). If they're upgrading and already have seats in use, the existing usage is carried over — so a customer with 3 seats in use would see a remaining balance of 7.

Autumn does not prevent you from passing a `quantity` lower than the customer's current usage. If the customer has 5 seats in use and you pass `quantity: 3`, the balance goes negative (-2). The `check` endpoint will return `allowed: false`, preventing new seats from being added, but existing seats are not forcibly removed.

### Usage-based per-unit

With usage-based billing, no quantity is needed at purchase time. Track seat additions and removals as they happen, and Autumn bills for the actual number of seats in use.

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

// Add a seat
await autumn.track({
  customer_id: "user_123",
  feature_id: "seats",
  value: 1,
});

// Remove a seat
await autumn.track({
  customer_id: "user_123",
  feature_id: "seats",
  value: -1,
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

# Add a seat
await autumn.track(
    customer_id="user_123",
    feature_id="seats",
    value=1,
)

# Remove a seat
await autumn.track(
    customer_id="user_123",
    feature_id="seats",
    value=-1,
)
```

```bash cURL
# Add a seat
curl -X POST "https://api.useautumn.com/v1/track" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "seats",
    "value": 1
  }'
```

</CodeGroup>

When a customer purchases the plan, any seats already in use are **automatically reflected** in their subscription from day one. For example, if a customer has 3 seats in use and purchases a plan with 5 included seats at $10/extra seat:

- Their balance starts at 5 (the included amount)
- The 3 existing seats are carried over, leaving a remaining balance of 2
- No extra charge yet — they're within the included amount
- As they add seats beyond 5, each additional seat is billed at $10/month with [proration](/documentation/modelling-pricing/proration)

## Existing usage on upgrade

When a customer upgrades from one plan to another, Autumn **automatically carries over** their current seat usage to the new plan. This ensures there's no gap in tracking — existing seats don't disappear or go unbilled.

### Prepaid

The customer's balance is set to their chosen quantity. Existing usage is then deducted from that balance.

> **Example**: Customer has **3 seats** in use. They purchase a plan with 5 included seats, passing `quantity: 10`.
> - Balance is set to 10 (5 included + 5 purchased)
> - 3 existing seats are deducted → **7 remaining**
> - Stripe charges for 10 seats (with 5 in the free tier)

### Usage-based

No quantity is needed. The Stripe subscription quantity is set to the customer's current usage automatically.

> **Example**: Customer has **3 seats** in use. They purchase a plan with 5 included seats at $10/extra seat.
> - Balance starts at 5 (included amount)
> - 3 existing seats are deducted → **2 remaining**
> - Stripe subscription reflects 3 seats in use (within the free tier, so no extra charge)
> - When they add a 6th seat, billing begins at $10/seat for the overage

| Scenario | Prepaid (qty: 8) | Usage-based |
|----------|------------------|-------------|
| **3 in use, 5 included** | Balance: 8 → 5 remaining. Charged for 3 extra. | Balance: 5 → 2 remaining. No extra charge. |
| **3 in use, 0 included** | Balance: 8 → 5 remaining. Charged for 8. | Balance: 0 → -3. Charged for 3 seats. |
| **7 in use, 5 included** | Balance: 8 → 1 remaining. Charged for 3 extra. | Balance: 5 → -2. Charged for 2 extra seats. |

## Checking access

Before allowing a user to add a new seat, check if they have capacity:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.check({
  customer_id: "user_123",
  feature_id: "seats",
});

if (!data.allowed) {
  // Prompt user to purchase more seats or upgrade
}
```

```python Python
response = await autumn.check(
    customer_id="user_123",
    feature_id="seats",
)

if not response.allowed:
    # Prompt user to purchase more seats or upgrade
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "seats"
  }'
```

</CodeGroup>

For **prepaid**, `allowed` is `true` when the customer has remaining prepaid balance (ie. unused seats).

For **usage-based**, `allowed` is `true` as long as the customer has a usage-based price configured — additional seats are simply billed at the per-unit rate, so there's no hard cap.

## Proration on quantity changes

When a customer increases or decreases their seat count mid-billing-cycle, you can configure how the price adjustment is handled. See [Proration](/documentation/modelling-pricing/proration) for details.

## Credit Systems

Credit systems let you track actions with different credit costs from a single balance pool.

A credit system is made up of a list of [features](/documentation/concepts/features) that can draw from it, and a credit cost per unit of usage for each feature.

> **Example** <br />
> You have a Pro plan that gives users `100 basic messages` per month, and `10 premium messages` per month. These 2 balances are separate and independent of each other.
> To give your users more flexibility, you instead decide to use a credit system, where:
> - `basic message`: costs 1 credit per message
> - `premium message`: costs 10 credits per message 
>
> Instead of having 2 separate balances for each message type, your Pro plan can have `200 credits` per month. Your users can use the credits in any combination of basic and premium messages they want.

## Creating a credit system

  Make sure you have some metered features created before creating a credit
  system.

<Tabs>
<Tab title="CLI">

Define metered features, then create a `credit_system` feature with a `creditSchema` that maps each feature to a credit cost:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const basicMessage = feature({
  id: 'basic_message',
  name: 'Basic Message',
  type: 'metered',
  consumable: true,
});

export const premiumMessage = feature({
  id: 'premium_message',
  name: 'Premium Message',
  type: 'metered',
  consumable: true,
});

export const credits = feature({
  id: 'credits',
  name: 'Credits',
  type: 'credit_system',
  creditSchema: [
    { meteredFeatureId: basicMessage.id, creditCost: 1 },
    { meteredFeatureId: premiumMessage.id, creditCost: 10 },
  ],
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: credits.id,
      included: 200,
      reset: { interval: 'month' },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to the features page, under Plans.
2. Click "Create Credit System"
4. Add the features that can draw from this credit system.
5. For each feature, define how many credits each unit of usage should cost (eg, 3 credits per "premium request").
6. Click "Create"

</Tab>
</Tabs>

**Example**

If each `premium_request` is worth 3 credits, then using 6 premium requests will cost 18 credits.

Now you can add this credit system to a plan, such as granting 50 credits per month or charging $1 per credit.

## Tracking and limiting credit usage

When implementing a credit system into your application, **you should interact with the underlying features -- not the credit system itself**. This means passing in the underlying `feature_id` when checking or tracking usage.

#### Checking access

Before allowing a customer to use a feature, `check` if they have enough credits to do so. If each "premium request" is worth 3 credits, then this example will check if the customer has at least 18 credits remaining.

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_test_1234" });

const response = await autumn.customers.check({
  customerId: "user_123",
  featureId: "premium_request",
  requiredBalance: 6,
});

console.log(response.allowed);
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_1234")

response = await autumn.customers.check(
    customer_id="user_123",
    feature_id="premium_request",
    required_balance=6,
)
print(response.allowed)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_test_1234" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "premium_request",
    "required_balance": 6
  }'
```

</CodeGroup>

<Expandable title="check response">
The response will contain the balance for the credit system that is being deducted from.

```json
{
  "allowed": true,
  "customerId": "user_123",
  "requiredBalance": 6,
  "balance": {
    "featureId": "credits",
    "granted": 100,
    "remaining": 100,
    "usage": 0,
    "unlimited": false,
    "overageAllowed": false,
    "nextResetAt": 1757192635393
  }
}
```

</Expandable>
In this case, we have a balance of 100 credits remaining, so we're allowed to use our 6 "premium requests" feature.

  If a feature is not defined in the credit system, it will return `allowed: false`

#### Tracking usage

Since the customer has sufficient credits, you can let them use their 6 "premium requests". Afterwards, you can [track](/documentation/customers/tracking-usage) the usage to update their balance.

This will decrement the customer's balance by 18 credits (6 requests * 3 credits per request).

<CodeGroup>
```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_test_1234" });

await autumn.customers.track({
  customerId: "user_123",
  featureId: "premium_request",
  value: 6,
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_1234")

await autumn.customers.track(
    customer_id="user_123",
    feature_id="premium_request",
    value=6,
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/track" \
  -H "Authorization: Bearer am_sk_test_1234" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "premium_request",
    "value": 6
  }'
```

</CodeGroup>

<Expandable title="track response">
```json
{
  "customerId": "user_123",
  "value": 6,
  "balance": {
    "featureId": "credits",
    "granted": 100,
    "remaining": 82,
    "usage": 18,
    "unlimited": false,
    "overageAllowed": false,
    "nextResetAt": 1757192635393
  }
}
```
</Expandable>

Since the customer started with a balance of 100 credits, and used 18 credits, their remaining balance is 82 credits.

## Stacking with direct balances

A feature can have both a direct balance **and** belong to a credit system. When this happens, the balances stack and **direct balances are always consumed before credit system balances**, regardless of interval.

> **Example** <br />
> A customer's plan grants `10 premium messages` per month directly, plus `200 credits` per month from a credit system (where each premium message costs 10 credits). <br /><br />
> When the customer sends a premium message, Autumn deducts from the direct premium message balance first. Once those 10 direct messages are used up, subsequent premium messages draw from the credit pool instead.

  The `check` endpoint accounts for both balances. If the customer has 5 direct premium messages remaining plus 100 credits (enough for 10 more premium messages), `check` will report that the customer is allowed.

## Monetary credits

You may want your credit system to represent a monetary value: eg, $10 of credits. To implement this, you can map each credit to a cent value (eg, 1 credit = 1 cent).

1. When creating your credit system, define credit amounts in the per-cent cost 

   Eg: if each `premium_request` costs 3 cents, our credit cost should be 3.

2. When adding the credits to a plan, set the granted amount of credits in cents 

   Eg, if customers get 5 USD credits for free, they should have an included usage of `500`.

3. When charging for the credits, set the cost of each credit to 1 cent

See the credits pricing guide for a more detailed example of setting up a monetary credits system

## AI Credit Systems

For AI applications that need to track token usage with per-model pricing, you can create an AI credit system. This lets you define markup percentages for each model and automatically calculate costs based on input/output tokens.

<Tabs>
<Tab title="CLI">

Markups are optional. `defaultMarkup` applies to every model unless overridden — by `providerMarkups` (keyed by the first segment of the model ID, e.g. `openrouter`), or by `modelMarkups` for a specific model, which takes highest priority. With no markups set, models are billed at their Models.dev base cost.

A markup of `-100` makes the model free: usage events are still recorded, but nothing is deducted from the balance.

```ts Simplest setup — one markup for everything
export const aiCredits = feature({
  id: 'ai_credits',
  name: 'AI Credits',
  type: 'ai_credit_system',
  defaultMarkup: 30, // every model billed at models.dev cost + 30%
});
```

Or mix the levels for finer control:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const aiCredits = feature({
  id: 'ai_credits',
  name: 'AI Credits',
  type: 'ai_credit_system',
  // Global fallback markup
  defaultMarkup: 30,
  // Per-provider defaults
  providerMarkups: {
    openrouter: { markup: 25 },
  },
  // Per-model overrides (highest priority)
  modelMarkups: {
    'anthropic/claude-opus-4-5': { markup: 20 },
    'anthropic/claude-sonnet-4-5': { markup: 15 },
    'openai/gpt-4o-mini': { markup: -100 }, // free for customers
    // For custom/self-hosted models, specify input/output costs in $/M tokens
    'custom/my-model': { markup: 25, inputCost: 0.01, outputCost: 0.03 },
  },
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 50, interval: 'month' },
  items: [
    item({
      featureId: aiCredits.id,
      included: 10, // $10 worth of AI credits
      reset: { interval: 'month' },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to the features page, under Plans.
2. Click "Create Credit System"
3. Toggle "AI Credit System" to enable model-based pricing
4. Set a default markup %, and optionally add providers with their own default markups
5. Add the models you want to support, overriding the markup per model where needed
6. For custom models, also specify input/output costs per million tokens
7. Click "Create"

</Tab>
</Tabs>

### Model ID Format

Model IDs follow the `provider/model` format:
- Standard models: `anthropic/claude-opus-4-5`, `openai/gpt-4o`
- OpenRouter models: `openrouter/anthropic/claude-opus-4.6`
- Custom models: `custom/my-model-name`

For standard models, pricing is automatically fetched from models.dev, including separate rates for cache reads/writes, reasoning, and audio tokens where the model publishes them, plus large-context tier pricing (e.g. above 200k input tokens) when applicable.

For custom models, you must specify both `inputCost` and `outputCost` in dollars per million tokens — tracking fails if either is missing. Custom models bill input and output tokens only; cache, reasoning, and audio pools are ignored.

### Tracking Token Usage

Use the `trackTokens` endpoint to deduct credits based on token usage:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_test_1234" });

await autumn.balances.trackTokens({
  customerId: "user_123",
  modelId: "anthropic/claude-opus-4-5",
  inputTokens: 1500,
  outputTokens: 500,
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_1234")

await autumn.balances.track_tokens(
    customer_id="user_123",
    model_id="anthropic/claude-opus-4-5",
    input_tokens=1500,
    output_tokens=500,
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/balances.track_tokens" \
  -H "Authorization: Bearer am_sk_test_1234" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "model_id": "anthropic/claude-opus-4-5",
    "input_tokens": 1500,
    "output_tokens": 500
  }'
```

</CodeGroup>

The cost is calculated automatically based on the model's pricing plus your configured markup percentage.

## Free Plans

Free plans let you give every new customer access to a limited set of features at no cost. They're the foundation of freemium models — customers start free and upgrade when they need more.

> **Example** <br />
> A developer tool offers a free tier with 100 API requests per month and 1 workspace. When a user exceeds the limit, they're prompted to upgrade.

## Setting up

<Tabs>
<Tab title="CLI">

Create a plan with no `price` and set `autoEnable: true`:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const apiRequests = feature({
  id: 'api_requests',
  name: 'API Requests',
  type: 'metered',
  consumable: true,
});

export const workspaces = feature({
  id: 'workspaces',
  name: 'Workspaces',
  type: 'metered',
  consumable: false,
});

export const free = plan({
  id: 'free',
  name: 'Free',
  group: 'main',
  autoEnable: true,
  items: [
    item({
      featureId: apiRequests.id,
      included: 100,
      reset: { interval: 'month' },
    }),
    item({
      featureId: workspaces.id,
      included: 1,
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and click **Create Plan**
2. Set the plan name and ID (e.g., "Free", `free`)
3. Toggle **Auto-enable** so the plan is automatically assigned to new customers
4. Add features and save your changes

</Tab>
</Tabs>

## How it works

When `autoEnable` is set, every new customer created via the API or SDK is automatically assigned this plan. This flag can only be set if there are no prices on the plan. Since there are no prices, no payment is required.

If a customer cancels their paid plan and you have an auto-enabled free plan in the same group, the free plan will be re-activated automatically.

## Gating features

Use the [check](/documentation/customers/check) endpoint to gate access based on the free plan's limits:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.check({
  customer_id: "user_123",
  feature_id: "api_requests",
});

if (!data.allowed) {
  // Prompt user to upgrade
}
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.check(
    customer_id="user_123",
    feature_id="api_requests",
)

if not response.allowed:
    # Prompt user to upgrade
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "feature_id": "api_requests"
  }'
```

</CodeGroup>

When `allowed` is `false`, the customer has exhausted their free tier balance. This is a good moment to prompt them to upgrade.

## Recurring Plans

Recurring plans let you grant customers a fixed allowance of consumable features -- like messages, credits, or API calls -- that resets each billing period. Customers pay a base price at a regular interval (monthly, quarterly, annually), and receive a fresh grant of their included features at the start of each cycle.

> **Example** <br />
> An AI writing tool offers a Pro plan at $20/month that grants 1,000 messages per month. When the billing period resets, the customer's message balance is reset back to 1,000.

## Setting up

<Tabs>
<Tab title="CLI">

Define a recurring plan in your `autumn.config.ts`:

```ts autumn.config.ts expandable
import { feature, item, plan } from 'atmn';

export const messages = feature({
  id: 'messages',
  name: 'Messages',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: messages.id,
      included: 1000,
      reset: { interval: 'month' },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** in the Autumn dashboard
2. Click **Create Plan**
3. Set a **name** and **ID** for the plan (e.g., "Pro", `pro`)
4. Under **Price**, set the amount and select a billing interval (`month`, `quarter`, `semi_annual`, or `year`)
5. Add consumable features to the plan -- set grant amounts and reset intervals. These will be granted to the customer each billing period once they subscribe.
6. Save your changes

</Tab>
</Tabs>

## Attaching a subscription

Use [billing.attach](/documentation/customers/payment-flow) to attach a subscription to a customer. With `redirectMode: "always"`, a checkout URL is always returned for the customer to complete payment or confirm the plan change.

<CodeGroup>

```tsx React
import { useCustomer } from "autumn-js/react";

const { attach } = useCustomer();

await attach({ planId: "pro", redirectMode: "always" });
```

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const response = await autumn.billing.attach({
  customerId: "user_123",
  planId: "pro",
  redirectMode: "always",
});

// Redirect customer to complete payment or confirm plan change
redirect(response.paymentUrl);
```

```python Python
import asyncio
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

async def main():
    response = await autumn.billing.attach(
        customer_id="user_123",
        plan_id="pro",
        redirect_mode="always",
    )

    # Redirect customer to response.payment_url

asyncio.run(main())
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "redirect_mode": "always"
  }'
```

</CodeGroup>

<Expandable title="customer object after attaching">
```json
{
  "id": "user_123",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "createdAt": 1771409161016,
  "fingerprint": null,
  "stripeId": "cus_U0BKxpq1mFhuJO",
  "env": "sandbox",
  "metadata": {},
  "sendEmailReceipts": false,
  "billingControls": {
    "autoTopups": []
  },
  "subscriptions": [
    {
      "planId": "pro",
      "autoEnable": false,
      "addOn": false,
      "status": "active",
      "pastDue": false,
      "canceledAt": null,
      "expiresAt": null,
      "trialEndsAt": null,
      "startedAt": 1771431921437,
      "currentPeriodStart": 1771431921437,
      "currentPeriodEnd": 1773851121437,
      "quantity": 1
    }
  ],
  "purchases": [],
  "balances": {
    "messages": {
      "featureId": "messages",
      "granted": 1000,
      "remaining": 1000,
      "usage": 0,
      "unlimited": false,
      "overageAllowed": false,
      "maxPurchase": null,
      "nextResetAt": 1773851121437,
      "breakdown": [
        {
          "id": "cus_ent_abc123",
          "planId": "pro",
          "includedGrant": 1000,
          "prepaidGrant": 0,
          "remaining": 1000,
          "usage": 0,
          "unlimited": false,
          "reset": {
            "interval": "month",
            "resetsAt": 1773851121437
          },
          "price": null,
          "expiresAt": null
        }
      ]
    }
  }
}
```
</Expandable>

When a subscription is created, Autumn:

1. Creates a Stripe subscription with the plan's prices
2. Grants the customer their included [balances](/documentation/concepts/balances) for each consumable feature
3. Starts the billing cycle -- balances reset automatically at the start of each period

## Billing intervals

Plans support the following billing intervals:

| Interval | Description |
|----------|-------------|
| `week` | Billed every week |
| `month` | Billed every month |
| `quarter` | Billed every 3 months |
| `semi_annual` | Billed every 6 months |
| `year` | Billed annually |

You can create a separate plan for each interval you want to support. For example, if you want to support monthly and annual plans, you can create a `pro_monthly` plan and a `pro_annual` plan.

You can also configure a custom `interval_count` to charge at non-standard intervals (e.g., every 2 months).

### Billing interval vs reset interval

The billing interval (how often the customer is charged) and the reset interval (how often their feature balance replenishes) are configured independently. They don't have to match.

> **Example** <br />
> A plan billed at $200/year could grant 100 messages/month. The customer pays once a year, but their message balance resets to 100 every month.

This is useful when you want to offer an annual discount while still metering usage on a shorter cycle.

## Managing subscriptions

Once a customer has an active subscription, you can manage upgrades, downgrades, and cancellations. See [Managing Subscriptions](/documentation/customers/subscription-lifecycle) for details on:

- **Upgrades** — prorated charges for switching to a higher-priced plan
- **Downgrades** — scheduled at end of billing period
- **Cancellations** — immediate or end-of-period

## Subscription statuses

| Status | Description |
|--------|-------------|
| `active` | Subscription is in good standing |
| `trialing` | Customer is in a [free trial](/documentation/modelling-pricing/trials) period |
| `past_due` | Payment failed, needs attention |
| `scheduled` | Will activate at end of current billing period (e.g., downgrade) |
| `expired` | Subscription has ended |

## One-Off Purchases

One-off purchases are single-charge plans that don't recur. They're used for one-time top-ups, lifetime access plans, or any plan where the customer pays once.

> **Example** <br />
> An AI platform lets users buy 500 credits for $10 as a one-time purchase. The credits never expire and can be used at any pace.

## Setting up

<Tabs>
<Tab title="CLI">

Set the plan's `price.interval` to `one_off`, or omit `interval` on the item price for a one-time charge:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const credits = feature({
  id: 'credits',
  name: 'Credits',
  type: 'metered',
  consumable: true,
});

export const creditTopUp = plan({
  id: 'credit_top_up',
  name: 'Credit Top-Up',
  items: [
    item({
      featureId: credits.id,
      price: {
        amount: 10,
        billingUnits: 500,
        billingMethod: 'prepaid',
        interval: 'one_off',
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and click **Create Plan**
2. Set the plan name and ID
3. Under **Price**, select **One-off** as the interval — or leave no base price if pricing is purely feature-based
4. Add a feature with a **prepaid** price. The customer will select a quantity at checkout
5. Toggle **Add-on** if this should be purchasable alongside other plans
6. Click **Create**

</Tab>
</Tabs>

## How it works

When a customer purchases a one-off plan:

- Autumn creates a Stripe invoice (not a subscription) and charges it immediately
- The feature balance is provisioned with the purchased quantity
- The balance has a `one_off` interval — it never resets or expires

One-off purchases don't create Stripe subscriptions. They generate a one-time invoice instead.

## Purchasing a one-off plan

For prepaid one-off plans, pass the desired `quantity` via the `options` array:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.checkout({
  customer_id: "user_123",
  plan_id: "credit_top_up",
  options: [{
    feature_id: "credits",
    quantity: 1000,
  }],
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.checkout(
    customer_id="user_123",
    plan_id="credit_top_up",
    options=[{
        "feature_id": "credits",
        "quantity": 1000,
    }],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/checkout" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "credit_top_up",
    "options": [{
      "feature_id": "credits",
      "quantity": 1000
    }]
  }'
```

</CodeGroup>

## One-off prices within a subscription

A subscription plan can include both recurring and one-off prices. When it does, Autumn splits them at checkout:

- **Recurring prices** bill every cycle as part of the Stripe subscription
- **One-off prices** are charged once on the first invoice only

This is useful for setup fees, one-time credit grants, or any charge that should happen once when the customer subscribes.

> **Example** <br />
> A Pro plan charges $20/month plus a one-time $50 setup fee. The customer's first invoice is $70, and subsequent invoices are $20.

<Tabs>
<Tab title="CLI">

Add a non-consumable feature for the setup fee, then include it as a separate one-off item alongside the recurring base price:

```ts autumn.config.ts expandable
import { feature, item, plan } from 'atmn';

export const setupFee = feature({
  id: 'setup_fee',
  name: 'Setup Fee',
  type: 'metered',
  consumable: false,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: setupFee.id,
      price: {
        amount: 50,
        billingMethod: 'prepaid',
        interval: 'one_off',
      },
    }),
  ],
});
```

When you attach the plan, you can select a quantity for the setup fee. The $20/month base price recurs on every invoice. The setup fee item is charged once on the first invoice only.

</Tab>
<Tab title="Dashboard">

1. Create a **boolean** feature for the setup fee (e.g., `setup_fee`)
2. Create a plan with a **recurring** base price (e.g., $20/month)
3. Add the setup fee feature as an item and set its price interval to **One-off**
4. The recurring charge will bill every cycle; the one-off charge applies to the first invoice only

</Tab>
</Tabs>

## Balance stacking

One-off balances stack with existing balances from subscriptions. Autumn uses [deduction order](/documentation/concepts/balances#deduction-order) to ensure shorter-interval balances (e.g., monthly) are used before one-off (lifetime) balances.

## Use cases

| Use case | Configuration |
|----------|---------------|
| Credit top-up | Prepaid price, add-on, no base price |
| Lifetime plan | One-off base price, features with no reset |
| One-time fee | One-off base price, no features |
| Setup fee + subscription | Recurring base price, one-off item price on same plan |

## Trials

Free trials give customers temporary access to a paid plan before they're charged. Autumn supports two trial modes: **card required** (collect payment info upfront, bill when trial ends) and **card not required** (no payment info needed, access expires automatically).

> **Example** <br />
> A SaaS tool offers a 14-day free trial of their Pro plan. If the customer doesn't cancel, billing begins on day 15.

## Setting up

<Tabs>
<Tab title="CLI">

Add a `freeTrial` object to your plan:

```ts autumn.config.ts expandable
import { feature, item, plan } from 'atmn';

export const messages = feature({
  id: 'messages',
  name: 'Messages',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  group: 'main',
  price: { amount: 20, interval: 'month' },
  freeTrial: {
    durationLength: 14,
    durationType: 'day',
    cardRequired: true,
  },
  items: [
    item({
      featureId: messages.id,
      included: 1000,
      reset: { interval: 'month' },
    }),
  ],
});
```

Trial duration types: `day`, `month`, `year`.

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and open your plan (or create a new one)
2. Under **Plan Settings**, toggle on **Free Trial**
3. Set the **duration** (e.g., 14 days)
4. Choose whether a **card is required**:
   - **Card required**: customer goes through Stripe Checkout, but isn't charged until the trial ends
   - **Card not required**: no checkout needed — the plan can be attached directly
5. Save your changes

</Tab>
</Tabs>

## Card required trials

When `cardRequired` is `true`, the customer must provide payment information to start the trial. Stripe creates a subscription with a trial period — no charge occurs until the trial ends.

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.checkout({
  customer_id: "user_123",
  plan_id: "pro",
});

// Returns Stripe Checkout URL — customer adds card and starts trial
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.checkout(
    customer_id="user_123",
    plan_id="pro",
)
# Returns Stripe Checkout URL
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/checkout" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro"
  }'
```

</CodeGroup>

If the customer doesn't cancel before the trial ends, their card is automatically charged.

## Card not required trials

When `cardRequired` is `false`, no checkout is needed. You can attach the plan directly:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.attach({
  customer_id: "user_123",
  plan_id: "pro",
});
```

```python Python
response = await autumn.attach(
    customer_id="user_123",
    plan_id="pro",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro"
  }'
```

</CodeGroup>

When the trial expires, the customer loses access unless they add a payment method. If a [free plan](/documentation/modelling-pricing/free-plans) with `autoEnable` exists in the same group, it's activated as a fallback.

You can combine `autoEnable` with `cardRequired: false` to create an **auto-trial** plan. The trial starts automatically when a customer is created, and expires after the trial period — no API call needed.

## Checking trial status

The customer's subscription includes a `trial_ends_at` timestamp when a trial is active. You can also expand `trials_used` to see which trials a customer has consumed:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.customers.get("user_123");

for (const sub of data.subscriptions) {
  if (sub.trialEndsAt) {
    console.log(`Trialing until ${new Date(sub.trialEndsAt)}`);
  }
}
```

```python Python
response = await autumn.customers.get("user_123")

for sub in response.subscriptions:
    if sub.trial_ends_at:
        print(f"Trialing until {sub.trial_ends_at}")
```

</CodeGroup>

## Trial deduplication

Each customer can only use a plan's trial **once**. If they try to attach the same plan again, the trial is skipped and they're billed immediately.

To prevent trial abuse across multiple accounts, set a `fingerprint` when creating a customer (e.g., device ID, browser fingerprint). Autumn checks whether any customer with the same fingerprint has already used the trial.

<CodeGroup>

```typescript TypeScript
await autumn.customers.create({
  id: "user_456",
  name: "Jane Doe",
  email: "jane@example.com",
  fingerprint: "device_abc123",
});
```

```python Python
await autumn.customers.create(
    id="user_456",
    name="Jane Doe",
    email="jane@example.com",
    fingerprint="device_abc123",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/customers" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "id": "user_456",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "fingerprint": "device_abc123"
  }'
```

</CodeGroup>

Custom trials passed via `customize.freeTrial` always **bypass** deduplication. Use this for support cases where you want to grant a second trial.

You can check which trials a customer has already used by expanding `trials_used` on the customer object:

<CodeGroup>

```typescript TypeScript
const customer = await autumn.customers.getOrCreate({
  customerId: "user_123",
  expand: ["trials_used"],
});
```

```python Python
customer = await autumn.customers.get_or_create(
    customer_id="user_123",
    expand=["trials_used"],
)

```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/customers" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "id": "user_123",
    "expand": ["trials_used"]
  }'
```

</CodeGroup>

## Upgrades and Downgrades

When upgrading to a plan with a trial, the trial behavior depends on the customer's current state and whether the new plan has an unused trial:

| Current state | Unused trial? | Result |
|---|---|---|
| Trialing | Yes | Current trial ends. Fresh trial starts on new plan. |
| Trialing | No | Current trial ends. Billing starts immediately. |
| Active (not trialing) | Yes | Trial starts. Current cycle refunded. |
| Active (not trialing) | No | No trial. Billing starts at new price. |

When a customer downgrades during a trial, the lower plan is scheduled to activate when the trial ends. The lower plan's own trial is not applied - you cannot get a new trial on a downgrade.

You can override any of these behaviors by passing `customize.freeTrial` on the attach call. See [Overriding trial behavior](#overriding-trial-behavior) below.

## Overriding trial behavior

You can override the default trial behavior on any `/attach` or `/update-subscription` call by passing `customize.freeTrial`:

<Tabs>
<Tab title="Custom trial">

Pass a `freeTrial` object to start a trial with a custom duration. This **bypasses deduplication** — the customer always gets the trial, even if they've trialed this plan before.

<CodeGroup>

```typescript TypeScript
await autumn.attach({
  customerId: "user_123",
  planId: "pro",
  customize: {
    freeTrial: {
      durationLength: 30,
      durationType: "day",
      cardRequired: true,
    },
  },
});
```

```python Python
await autumn.attach(
    customer_id="user_123",
    plan_id="pro",
    customize={
        "free_trial": {
            "duration_length": 30,
            "duration_type": "day",
            "card_required": True,
        }
    },
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "customize": {
      "free_trial": {
        "duration_length": 30,
        "duration_type": "day",
        "card_required": true
      }
    }
  }'
```

</CodeGroup>

</Tab>
<Tab title="End / skip trial">

Pass `freeTrial: null` to skip the trial entirely and begin billing immediately — even if the plan has a trial configured.

<CodeGroup>

```typescript TypeScript
await autumn.attach({
  customerId: "user_123",
  planId: "pro",
  customize: {
    freeTrial: null,
  },
});
// Charged immediately, no trial
```

```python Python
await autumn.attach(
    customer_id="user_123",
    plan_id="pro",
    customize={"free_trial": None},
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "customize": { "free_trial": null }
  }'
```

</CodeGroup>

You can also pass `freeTrial: null` on `/update-subscription` to end an active trial early and start billing right away.

</Tab>
<Tab title="Extend trial">

To extend a trial, call `/update-subscription` with a new `customize.freeTrial`. The new trial duration is computed **from now** — it replaces the current trial end date rather than adding to it.

<CodeGroup>

```typescript TypeScript
// Customer is 5 days into a 14-day trial.
// This gives them a fresh 14 days from now (not 14 + 9 remaining).
await autumn.updateSubscription({
  customerId: "user_123",
  planId: "pro",
  customize: {
    freeTrial: {
      durationLength: 14,
      durationType: "day",
    },
  },
});
```

```python Python
await autumn.update_subscription(
    customer_id="user_123",
    plan_id="pro",
    customize={
        "free_trial": {
            "duration_length": 14,
            "duration_type": "day",
        }
    },
)
```

</CodeGroup>

Trial extensions are **replacement**, not additive. If a customer is 5 days into a 14-day trial and you set a new 14-day trial, they get 14 days from today (19 days total from the original start), not 14 days added to the remaining 9.

</Tab>
</Tabs>

## Trials with shared subscriptions

When using [entities](/documentation/modelling-pricing/sub-entity-plans) or add-ons, trial state is shared across the same Stripe subscription. This is because Stripe manages trials at the subscription level.

You can pass in `newBillingSubscription: true` to create a new subscription for each plan, rather than merging into the existing subscription.

Here are some principles to keep in mind when using trials with shared subscriptions:

#### First entity gets the trial

When the first entity is attached with a trial plan, the trial starts on the shared subscription. Any subsequent entities attached to the same subscription **inherit the existing trial state** — they don't start their own independent trial.

#### Adding plans to a non-trialing subscription

If the subscription is **not** trialing, new plans are charged immediately — even if the product they're being attached to has a trial configured. The product's trial config is ignored for merges into an active subscription.

#### Shared trial state affects all plans

Because entities (by default) share a subscription, trial state changes affect **all** entities:

- **Entity upgrade to a plan with a trial**: a fresh trial starts, and all other entities on the subscription inherit the new trial end date.
- **Entity upgrade to a plan without a trial**: the trial ends for **all** entities, and they're all billed immediately.
- **Entity downgrade during trial**: the downgrade is scheduled for when the trial ends.

Passing `customize.freeTrial` on an entity attach or upgrade affects the **shared subscription**, so all entities are affected. Similarly, passing `freeTrial: null` ends the trial for all entities on the subscription.

## Resetting usage after trial 

This feature is coming soon.

By default, feature usage during a trial carries over into the paid period. If you want usage to **reset when billing starts**, pass `transition_rules.reset_after_trial_end` with the feature IDs to reset:

<CodeGroup>

```typescript TypeScript
await autumn.attach({
  customerId: "user_123",
  planId: "pro",
  transitionRules: {
    resetAfterTrialEnd: ["messages"],
  },
});
```

```python Python
await autumn.attach(
    customer_id="user_123",
    plan_id="pro",
    transition_rules={
        "reset_after_trial_end": ["messages"],
    },
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "pro",
    "transition_rules": {
      "reset_after_trial_end": ["messages"]
    }
  }'
```

</CodeGroup>

This sets the feature's reset cycle to begin when the trial ends rather than when the trial starts, so the customer gets a full fresh allowance once they start paying.
