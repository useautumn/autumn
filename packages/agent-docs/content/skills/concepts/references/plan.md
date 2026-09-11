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
