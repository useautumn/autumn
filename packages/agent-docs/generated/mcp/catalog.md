# Catalog

First read the `autumn-concepts` knowledge — it defines Autumn's data model — features, plans, plan items, balances — which every modeling decision builds on.

## STRICT RULES — re-read before every config write

1. **Amounts are in major units (e.g. dollars), never minor units (cents).** $180/month is `amount: 180`. $0.01 per credit is `amount: 0.01`. If any amount you wrote is 100× the user's number, it is wrong.
2. **Never invent a price, limit, or plan name** — a missing number is a question.
3. **One definition per real thing.** One feature per resource, one child plan per license pattern (parents customize their license, never get their own copy), one add-on per offer (sizes are tiers, not plans).

**Building, or iterating on a live catalog?** What matters is whether customers are on these plans — not whether a config file exists. Still setting up (even across sessions, with a half-built `autumn.config.ts`) → the workflow below; edit the draft freely. Already running Autumn with customers, now changing prices/plans → that's an update with real stakes (versioning, migrations, grandfathering) — read `references/catalog-update.md` first. Unsure → check for customers (`atmn pull` / the org) or ask.

Turning pricing into a catalog is two jobs:

- **Shape** — decide the structure: which plans exist, what's a variant, what's an add-on, where balances live. Decided by relationships in their pricing, not by amounts.
- **Fill** — put in the numbers and per-item details, then write and validate the config.

Do Shape fully before Fill. Take numbers whenever the user mentions them, but never chase numbers during Shape — the one exception is "is this the same on every plan?", which is a structure question.

## Progress (what the user sees)

Copy this checklist into your first message and keep it up to date. It is the **only** structure the user ever sees — never say "step", "pass", "decide", or "fork" to them. If you skip an item, say why in one line.

- [ ] 1 Your plans and prices
- [ ] 2 What's included in each plan
- [ ] 3 How billing behaves (signup, trials, limits)
- [ ] 4 Licenses — paid seats, workspaces, projects (if any)
- [ ] 5 Structure agreed
- [ ] 6 Config written and checked

## How to ask

- One topic per message. Two questions at most, and only if both belong to that topic. Never mix topics in one message.
- If one ambiguity changes which other questions apply, resolve it first before asking those.
- Attach your guess to each question — "does the trial need a card? I'd guess no" — a wrong guess gets corrected faster than a blank gets answered.
- Assert the obvious instead of asking. "500 messages a month" resets monthly — state it as an assumption, don't ask. Questions are only for facts that change the structure and can't be guessed.
- Skip anything they already told you. A good message to answer is a nod, not homework.
- Never announce what you'll do next ("once I get those three, I'll restate…") — just work the current topic.
- The restate (step 5) is the safety net: wrong assumptions get caught there cheaply, which is what makes fewer questions safe.

## Shape: collect, then decide

Work the four steps below in order, one at a time — each says when it's done. While collecting, make only the small calls each step allows; leave the big ones (marked ↦ Decide) for after.

### Step 1 — Plans

- What are the plans? ("Free, Pro $20/mo, Growth $50/mo")
- Free tier? → a plan with no price that every new customer starts on automatically.
- Anything bought *alongside* a plan rather than instead of it (packs, extra storage)? → note it ↦ Decide (add-on).
- Enterprise tier? Ask. If it exists, model the base enterprise plan in the catalog, and tell the user: custom terms per customer (special prices, custom limits) are applied later when attaching, not modeled here.

Done when you can list every plan they sell, including free, add-ons, and enterprise.

### Step 2 — What each plan includes

Have them describe what they charge for or limit, in their own words. Pick a type per feature:

| They say | Feature type |
|---|---|
| "Pro has SSO" | boolean (on/off) |
| "500 messages a month" | metered, resets |
| "10 team members" | metered, no reset (held, not used up) |
| "credits" / "tokens" / "wallet" | credit system — always, even if only one action uses it today. They will add more actions; a single mapped action is fine. Their app tracks the actions (chat, image), never the credit balance itself. |

Note top-ups ("buy more when you run out", "auto-recharge") ↦ Decide (top-up placement).

### Step 3 — How billing behaves

This step usually means explaining Autumn to the user in plain words. Do.

- **Signup**: every new customer automatically gets the default plan — usually the free one. One default per group. A default can carry no prices at all — a "$0" plan with paid items (per-seat charges, prepaid packs) is a paid plan, not a default. If every plan bills something, there is no default; customers subscribe.
- **Trials**: ask "does the trial need a card?" (guess from their motion — PLG usually no). Card → `free_trial` on the paid plan. No card → a **separate free trial plan** (`pro_trial`: no price, the paid plan's items, auto-enabled when everyone starts on it); the paid plan stays untouched, since a default plan can never be paid. ### Plan

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
- **What is a plan attached to?** The customer, or each thing they own (workspace, project, site)? "Pro is $200 per workspace" → attached per entity. Pin this down — it changes everything downstream.
- **Who uses each metered feature?** The customer as a whole, or each entity? If entities: one shared balance or separate ones? "Shared across…" → shared ↦ Decide (balances).

Done when you know what attaches where, who consumes what, and how trials and signup work.

### Step 4 — Licenses

Triggered whenever the customer pays per unit of some entity — seats, workspaces, projects, sites, members: "each X is $10/month", "comes with 3 X". When you see one, always ask: **what does one X come with?** Never skip this because the user didn't say "seat". # Licenses

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

- Nothing of its own ("$10 per seat", just a count) → a per-unit priced item on the plan. No entities. The common case.
- The unit gets something of its own ("each seat gets 100 credits", "every workspace has its own allowance") → a **license**: a small plan of its own that the parent plan hands out per unit.
- Units must be assigned, reassigned, or sit empty → also licenses. Rare — confirm they need it.

# Seats: per-unit item or licenses?

The normal case is simple; the trap is missing the uncommon one.

## Normal: seats are just a number

*"$10 per seat."* Nothing granted per seat, nobody assigns seats to people.

→ A per-unit priced item on the plan. No entities, no licenses. Done.

## The trap: each seat grants something

*"Team is $40/seat/month, every seat gets 100 summaries."*

Tempting (wrong): per-unit seat item + one big summaries allowance on the team plan.

Why it breaks: the allowance doesn't grow when they add a 6th seat, and seats have no identity — no per-seat balance, no assigning seat #3 to Alice.

Right: the seat is a **license** — a small plan of its own (own group, $40 price, grants 100 summaries) that the team plan hands out per seat. `included` on the license link is how many come free with the parent; extras bill at the seat plan's price:

```ts
export const seat = plan({
  id: "seat",
  group: "seat",
  price: { amount: 40, interval: "month" },
  items: [item({ featureId: summaries.id, included: 100, reset: { interval: "month" } })],
});

export const team = plan({
  id: "team",
  price: { amount: 500, interval: "month" },
  licenses: [{ licensePlanId: seat.id, included: 5 }],
});
```

Division of labor when both levels exist: **per-seat things (the seat's own price, its granted allowance) live on the license plan; account-wide things (base price, shared purchases like credit packs) live on the parent** — the parent attaches at the customer, so its items are already shared by every seat. Don't invent add-on plans for purchases the parent can carry, and don't put the per-seat grant on the parent (it wouldn't scale with seats).

## When parents differ: one child, per-license diffs

**Define the child plan ONCE; every parent references the same child id, carrying its own differences in `customize`.** N parents → 1 child plan definition → N license entries. The child holds the mainline take (what the primary parent gets) plus everything all units share (boolean features); a differing parent's license overrides only its own price/grant.

The shape, schematically:

```ts
export const <child> = plan({
  id: "<child>",
  group: "<child>",                       // own group, or attaching replaces the parent
  price: { amount: <mainline unit price>, interval: "month" },
  items: [ <mainline grant>, <booleans every unit has> ],
});

export const <parentA> = plan({           // gets the mainline take: link only
  licenses: [{ licensePlanId: <child>.id, included: <n> }],
});

export const <parentB> = plan({           // differs: diff on the license, never a second child plan
  licenses: [{
    licensePlanId: <child>.id,
    included: <m>,
    customize: {
      price: { amount: <parentB unit price>, interval: "month" },
      addItems: [ <parentB's grant> ],
      removeItems: [ <filter matching the mainline grant> ],
    },
  }],
});
```

Worked example — an agency platform: Studio ($90/mo) and Agency ($450/mo) both sell client sites. A site is $8/mo on Agency with 2,000 renders; on Studio it's $12/mo with only 750. Every site gets SSL:

```ts
export const site = plan({
  id: "site",
  group: "site",
  price: { amount: 8, interval: "month" },
  items: [
    item({ featureId: renders.id, included: 2000, reset: { interval: "month" } }),
    item({ featureId: ssl.id }),
  ],
});

export const agency = plan({
  id: "agency",
  price: { amount: 450, interval: "month" },
  licenses: [{ licensePlanId: site.id, included: 10 }],
});

export const studio = plan({
  id: "studio",
  price: { amount: 90, interval: "month" },
  licenses: [{
    licensePlanId: site.id,
    included: 2,
    customize: {
      price: { amount: 12, interval: "month" },
      addItems: [item({ featureId: renders.id, included: 750, reset: { interval: "month" } })],
      removeItems: [{ featureId: renders.id }],
    },
  }],
});
```

WRONG — child duplicated per parent:

```ts
export const studioSite = plan({ id: "studio_site", price: { amount: 12, ... }, items: [ /* 750 renders, SSL */ ] });
export const agencySite = plan({ id: "agency_site", price: { amount: 8, ... },  items: [ /* 2000 renders, SSL */ ] });
```

RIGHT — the `site` config above: one `site` plan, two license entries, studio's diff in `customize`. Duplicated children break sharing — an SSL change now needs two edits, and a customer moving Studio→Agency gets a brand-new site plan instead of the same one on new terms.

**Self-check before finishing: count the child plan definitions for this pattern — there must be exactly one.**

## Rare: seats need identity but grant nothing

They want to assign, reassign, and hold empty seats — each seat tracked on its own plan. Also licenses. Uncommon; confirm they actually need it before reaching for this.

## Deciding

Ask one question: **does a seat grant anything?**

- No → per-unit item (normal case).
- Yes → licenses.
- No, but they need to track who holds each seat → licenses (rare — confirm).

What licenses *are* (pools, assign/release, per-link customize) is defined in the `autumn-concepts` skill's licenses reference; attach flows live in the entity-plans docs. Read those when building — this file only owns the decision.

### Before deciding: restate

Only after your questions are answered — never announce it in advance, and never restate facts nobody has confirmed yet. One short message: the plans, what's metered, what attaches where, who shares what. Let the user correct it. A wrong fact here is much cheaper than a wrong structure later.

If the user gave you everything up front and you asked nothing, skip the separate restate — the structure message (checklist item 5) does that job.

## Decide

Resolve these with all facts in hand. Each has a default — when the facts genuinely don't settle it, show both options in one line each and ask.

**Variant or separate plan?**
A variant can change the price, swap items in or out, and change the trial — nothing else.

- "Pro monthly / Pro annual, same features" → variant. (Annual usually still resets allowances monthly — billing and reset intervals are independent. Confirm.)
- Volume buckets/tiers — one question decides: **is each bucket the subscription itself (→ a variant per bucket) or a purchase on top of one (→ a prepaid item)?**
- Different features per tier → separate plans. One plan per tier is normal, not a smell.

# Volume buckets: variants or one prepaid item?

## The trap: "tiers" in the user's mouth becomes `tiers` in the config

*"Starter also comes in higher transcription tiers — the 60K tier at $39/month with 60,000 minutes included, the 150K tier at $69/month with 150,000. Same $1.20 per 1,000 overage on all of them."*

Tempting (wrong): fold the tiers into Starter as one prepaid volume-tiered item. It type-checks, it pushes. Two smells say it's wrong before it breaks:

- Starter's $19 base price has nowhere to go — you end up deleting it and decomposing each tier price into fake quantity rows. **Restructuring the existing plan to make the new "tiers" fit is the wrong-fork smell.**
- $19/20K, $39/60K, $69/150K follow no per-unit rate — these are price points on a menu, not a price rule.

Right — each tier IS the subscription, so each is a variant of the base plan:

```ts
export const starter60k = starter.variant({
  id: "starter_60k",
  name: "Starter 60K",
  customize: {
    price: { amount: 39, interval: "month" },
    addItems: [item({ featureId: minutes.id, included: 60_000, reset: { interval: "month" }, price: minuteOverage })],
    removeItems: [{ featureId: minutes.id }],
  },
});
```

The base plan stays untouched; customers upgrade between tiers like between plans.

## When one prepaid item IS right

*"Buy extra render hours any time: 200 for $30, 1,000 for $120, 5,000 for $500."*

The bucket is a quantity bought **on top of** whatever plan they're on — nothing about their subscription changes. One prepaid item with volume tiers, because the tier rows only map quantity to price. Where that item sits (plan vs add-on) is the add-on fork's question, not this one's.

## Deciding

Ask one question: **is each bucket the subscription itself, or a purchase on top of one?**

- The subscription itself → one variant per bucket.
- A purchase on top → prepaid item; volume tiers when the per-unit rate shifts with quantity.
- Per-bucket overage rates or per-bucket features → variants regardless; one item cannot express those.
- Unsure → variants (they can express anything a tier row can, not vice versa), or ask: "do customers subscribe to a tier, or buy an amount on top of their plan?"

What variants can and cannot change is defined in the plan-variants docs; this file only owns the decision.

**Add-on, or part of the plan?** Two independent questions: is the purchase priced/bundled per plan (→ item on each plan) or one offer across plans (→ one add-on plan, sizes as tiers on its prepaid item)? And does a plan exist at the level its balance is shared at (→ item there) or are all plans entity-attached (→ a customer-level add-on is forced)? Auto-recharge needs the prepaid item to exist — add it in Shape, it's structural.

# How does a purchase-on-top get modeled?

"Customers can also buy extra credits/packs/top-ups" — two independent questions decide the structure. Answer both; neither alone does.

## Q1 — Whose subscription is it part of?

- Priced or bundled differently per plan ("$20/20k on Team, $60/20k on Starter") → a prepaid **item on each plan**. The price difference IS plan differentiation; a separate add-on can't express it.
- Same offer regardless of plan, opt-in → **one add-on plan** (`addOn: true`, the purchase as its prepaid item). Several sizes are tiers on that one item, not a plan per size.

## Q2 — What level does its balance live at?

The purchase must sit on something attached where the balance is shared.

- Base plans attach at the **customer** → they already ARE customer-level; a shared purchase can be an item on them (Q1 decides which shape).
- Base plans attach **per entity** → no plan at the shared level exists, so a shared purchase forces a **customer-level add-on** — even if Q1 alone wouldn't have created one. An item on the entity plan would strand the balance on one entity.

## The contrast (same sentence, two structures)

*"Teams can also buy shared credit packs."*

```
parent plans at the customer          plans attached per entity
(seats/units via licenses)            (each workspace its own plan)

  Team ── prepaid pack item             workspace plan ── pooled grant
  Starter ── prepaid pack item                │
       (per-plan pricing, Q1)                 ▼
                                      customer add-on ── prepaid pack item
                                       (no customer plan existed, Q2)
```

Left: the parent plan is already customer-level, so the pack is just an item there — and per-plan pricing demanded it anyway. Right: every plan is entity-attached, so the shared pack needs its own customer-level add-on plan.

Say why in the proposal: "packs go on the plan since each plan prices them differently" or "packs are a separate purchase shared by all workspaces".

**Where do balances and purchases live?**
The rule: **purchases and balance at the customer; usage tracking and caps at the entity.** Grants "shared across…" entities → pooled (`pooled: true` on the item); separate per-entity balances → no pooling; overage stays on the entity's plan either way.

# Where do balances and purchases live?

## The trap: putting shared purchases on the plan

*"Growth is $99/mo per project and includes 20k tokens. Teams can also buy token packs — shared across all their projects."*

Tempting (wrong): put the prepaid pack items on the growth plan. It type-checks, it pushes. It breaks the first time a team buys a pack: the tokens land on ONE project's balance instead of being usable by all of them.

Right — split by who owns what:

```
project A gets 20k + overage ┐
project B gets 20k + overage ├──►  one shared customer balance  ◄── token-pack add-on (customer level)
project C gets 20k + overage ┘          ▲
                                        └── any project's usage draws from here
```

- The plan's allowance (20k per project): pooled — each project's grant joins the shared customer balance (`pooled: true` on the item).
- Purchases the whole team shares (packs): here a customer-level add-on plan, because every plan is entity-attached — no customer-level plan exists to carry the item. The full plan-item-vs-add-on decision is the add-on fork's.
- Overage ($/token past the allowance): usually an item on each project's plan even when the balance is pooled, because that breaks extra usage down per entity. Two items on the plan: the pooled grant carries no price, and a separate usage-priced item (`included: 0`) carries the overage — a pooled item can't itself be usage-priced.

## Deciding

The rule of thumb: **purchases and balance at the org; caps and usage tracking at the entity.**

- Each entity has its own allowance and its own limit → separate balances per entity (attach the plan per entity, no pooling).
- Grants combine and anyone can spend the total → pooled.
- "Shared across…" anywhere in the pitch → strong pooled signal. Confirm, don't assume separate.
- Want a per-entity cap on a shared balance → that's a usage limit (billing control), not a separate balance.

How pooled balances actually behave (contributions, stacking with customer purchases) is defined in the `autumn-concepts` skill — the plan-items reference for the item flag, the customer-entity reference for the runtime balance. This file only owns the decision.

**Groups?**
Can one customer hold two plans at once from different lines (a support plan AND a sales plan)? → one group per line. Within a group, attaching a plan replaces the current one; that's what makes upgrades work.

**One-off?**
"Lifetime deal", "one-time pack" → a plan with a one-off price: single invoice, no subscription, balances never reset.

## Check

Compare the structure against the shapes in `references/cases.md`. If their pricing matches a known shape but your structure differs, either say why or fix it.

Shortcuts that are usually wrong — catch yourself before Show:

| You're thinking | Check first |
|---|---|
| "seats + credits → licenses" | Are the credits per seat, or one shared pot? Shared → per-unit seats + pooled balance, no licenses. |
| "annual pricing → separate plan" | Same features? → variant. |
| "tiers → one plan with tiers" | Does overage or anything else differ per tier? → plan per tier. |
| "they said credits but it's one action → plain meter" | Credits are always a credit system. |
| "packs belong on the plan" | Are they shared across entities or plans? → add-on. |
| "everyone starts on a Pro trial → trial + auto-enable on Pro" | A default plan can never be paid. → separate free `pro_trial` plan (Pro's items, no price, auto-enabled); Pro untouched. |
| "several top-up sizes → one add-on plan per size" | Do the sizes differ only in quantity and price? → volume tiers on one prepaid item, one add-on plan. |
| "the pack is priced per plan → an add-on per plan" | Per-plan pricing IS plan differentiation → a prepaid item on each base plan, no add-ons. Add-ons are for one offer shared across plans, or when no plan exists at the shared level. |
| "the seat differs per plan → one seat plan per parent" | ONE child plan carrying the mainline take; each differing parent's license carries its own diff via `customize`. Never a `<parent>_seat` plan per parent. |

# Worked cases

Five archetypes, each chosen because it teaches one structural fork. They are shapes, not current company pricing — the numbers are illustrative.

## 1. CI platform with per-project build minutes (F4: pooled)

Pitch: "Team is $150/mo per project and includes 8k build minutes. Orgs can buy minute packs — shared across all their projects."

- Naive: prepaid pack items on the team plan. Packs land on one project's balance; "shared" is broken.
- Structure: team attached per project with a `pooled` minutes item (each project's 8k joins one customer balance); packs on a customer-level add-on plan; overage stays an item on each project's plan so extra usage breaks down per entity.
- The deciding fact: purchases are shared, allowances are per-project. Purchase and balance at the customer; grants and attribution at the entity.

## 2. Team plan where seats carry credits (F3: licenses)

Pitch: "Team is $40/seat/month; every seat gets 100 summaries a month."

- Naive: per-unit seat item + one big summaries allowance on the team plan. The allowance doesn't scale with seats and seats have no identity.
- Structure: a seat license plan (own group) priced $40 granting 100 summaries; the team plan offers it via `licenses`.
- The deciding fact: the seat *grants something*. Count-only seats would stay a per-unit item with no entities at all.

## 3. Webhook delivery tier ladder (F1: plan-per-tier)

Pitch: "$20/mo for 50k events, $35 for 100k, $60 for 200k — overage $0.90/1k, $0.70/1k, $0.45/1k respectively."

- Naive: one plan with a volume-tiered item. Collapses because each rung needs its own overage rate, and an item has one.
- Structure: one plan (or variant) per rung; the prepaid tier is the price (no base price); each carries its own usage-priced overage item.
- The deciding fact: something differs *in kind* per tier, not just in amount.

## 4. AI app with actions and credits (F5: credit system)

Pitch: "Pro includes 500 credits; a chat message costs 1 credit, an image 5, a video 25."

- Naive: three metered features with three allowances. Users see three balances; pricing page shows one.
- Structure: one credit-system feature mapping the three actions at their rates; plans grant credits; app tracks the underlying actions, never the credit system directly.
- The deciding fact: several actions draw one shared balance at different rates.

## 5. Annual pricing that resets monthly (F1 detail)

Pitch: "Pro $20/mo or $200/yr — 1,000 messages per month either way."

- Naive: annual plan granting 12,000 messages a year.
- Structure: annual variant of pro; price interval year, reset interval month. Billing interval and reset interval are independent.
- The deciding fact: the allowance is stated per month even when billing is annual. Ask when the pitch doesn't say.

## Show

Present the structure in the "Showing the catalog" format below — the same one used for every catalog display, catalog inside a fenced code block. Numbers you don't have yet stay open, never invented: write the line without them ("AI messages per month — amount TBD"). Structure notes go in parentheses on the line they describe. The whole message:

````
Here's the structure I'd build:

```
Features: AI credits (credit system — chat and image messages draw from it) · SSO (on/off)

Free — no price, everyone starts here
  - 100 AI credits per month
Pro — $20/month, or annual (same features)
  - AI credits per month — amount TBD
  - SSO
Credit pack (add-on) — price TBD, shared across all workspaces
```

I assumed: credits reset monthly, no rollover. Anything wrong?
````

List every assumption. Get a clear yes — "sounds good" without reading is not a yes. But if the user already told you to go ahead without review ("no need to ask", "just build it"), show the structure and keep going — don't stop to wait. If a late fact changes the structure, redo the affected decision, update the structure, and show what changed in one line.

## Fill

Structure agreed — now finish it. Four moves, in order.

**1 — Fill in what's known.** Everything the user already said goes straight into the draft. Never re-ask a confirmed fact.

**2 — Ask for missing essentials.** Values with no sane default: base prices, included amounts, per-unit prices, tier boundaries, trial length. Never invent one — a missing number is a question. Batch per the how-to-ask rules.

**3 — Sweep the options.** Ask each of these **once for the whole catalog**, in plain words — never item by item. The answer distributes to every item it touches ("carry over on both plans, or just Growth?" only if they hint at a difference). Raise a bucket only when the structure makes it relevant; skip anything already answered.

- **Carry-over** — any allowance that resets: "Should unused messages carry over month to month, or reset clean?"
- **Running out** — any metered feature: "When they run out — hard stop, or keep going and bill the extra?" (often settled in Shape; skip if so)
- **Top-ups** — credits present or buying-more mentioned: "Can they buy more before the reset?" → a one-off prepaid item
- **Guardrails** — any plan with overage or heavy usage: "Any caps on how fast or how far usage can run — like a daily limit, or a ceiling on overage? Want customers warned as they approach limits?" → plan-level billing controls
- **Anything else on/off** — always, it's cheap: "Any other on/off differences between plans — SSO, priority support, API access?"

The sweep exists so the user hears what's configurable without being marched through every item. Behind it, check every knob yourself — this list is internal, never show it:

- per plan: base price · trial (length, unit, card — all explicit) · default plan · group · billing controls (guardrails answered → `billingControls(...)` on the plan)
- per item: billing method · included · price or tiers (tier behavior explicit) · reset · rollover · pooled (if Shape chose shared balances) · purchase caps · the one-off item auto-recharge needs

Landing a guardrail answer means picking the right control — windowed cap vs overage ceiling vs alert vs allow-past-balance vs auto-recharge are different knobs with different fields. What each one is, the three overage knobs, and the plan→customer inheritance are the `autumn-concepts` skill's billing-controls reference — read it before writing `billingControls(...)`. The flow rules here:

- Plan-level controls are defaults every subscriber inherits — the right home for anything true of the whole plan ("free users max 20 emails/day"). Per-customer exceptions are a billing/customer operation, not catalog work.
- A cap stated alongside an allowance ("1,000 a month but never more than 20 a day") is a usage limit on the plan, not a second item or a smaller allowance.
- "Track it but don't bill it" / "let them run over, we'll invoice manually" → overage knobs on the plan, not a $0 price.
- Auto-recharge needs its one-off prepaid item (already on the per-item list) AND the `auto_topups` control.

**4 — Propose, then finalize.** One message: the full catalog in the format below, then "I assumed:" listing every knob you defaulted. Fold corrections in. Then write the config — and before saving, re-read every amount in it: dollars, never cents ($600 is `600`, not `60000`). Validate with `atmn --headless push`, fix what it flags, and show the final catalog — same format, no assumptions list. Note: on a clean org that command applies as it validates (see `references/atmn.md`) — that's fine, just describe it accurately. **Done means the config is written and valid — a summary is not done.**

### Showing the catalog

Use **exactly this format** every time you show the catalog — the Show structure message, the Fill proposal, and the done message alike. Never a markdown table, never a different layout per message. Send it as a fenced code block (```) so the indentation survives markdown rendering — plan names on bare lines otherwise get folded into the previous plan's list. It's the same grammar the dashboard renders. Features first with their kind, then plans, one line per item:

```
Features: AI messages (usage, resets) · Seats (held, not used up) · Credits (credit system — 1 message = 1 credit) · SSO (on/off)

Pro — $20/month
  - 500 AI messages per month
      · unused carry over, up to 500, for 1 month
  - 500 AI messages per month, then $0.01 per message
  - $10 per 1,000 credits
  - 5,000 credits for $50 per month
  - 3 seats included, then $10 per seat
  - $18 - $15 per seat
  - Unlimited projects
  - SSO
  - 100 credits per seat per month
Team — $500/month
  - 5 seats included, then $40 per seat per month
      each seat gets:
      · 100 summaries per month
      · SSO
Credit pack (add-on) — $10 for 1,000 credits, buy anytime
```

The Features line names every feature and its kind in plain words: `(usage, resets)` for consumable meters, `(held, not used up)` for non-consumable ones like seats, `(credit system — …)` with its action mappings, `(on/off)` for boolean. Item lines, top to bottom: plain allowance · allowance with overage · pure usage price (per billing unit) · prepaid bucket · included + prepaid per-unit · tiered rate shown first-to-last · unlimited · boolean (name only, never "enabled") · per-entity grant · one-off add-on. Numbers get commas; "then …" says what happens after the included runs out; annual variants go inline ("or $200/year — messages still reset monthly").

Configured item properties — carry-over, purchase caps, top-up behavior — are never their own `-` lines: indent them under the item they belong to as `·` lines, one behavior each, so the hierarchy is visible. Only show what's configured; defaults (like usage simply stopping when no overage price is set) get no line.

Billing controls follow the same rule: `·` lines under the item they guard, in plain words — `· max 200 per day` · `· overage capped at 20% over` · `· overage tracked, not billed` · `· warned at 80%` · `· auto-buys 1,000 credits when below 100`. Never the schema names (usage_limits, spend_limits) in user-facing text.

### Config gotchas

- Amounts are plain dollars everywhere — base prices, tier `flatAmount`s, unit prices: $20 is `20`, never `2000`, and a $100 tier is `flatAmount: 100`, never `10000`. Re-check every number before writing; cents is the most common wrong config.
- A default/auto-enabled plan can't be paid: no base price, no paid items.
- A prepaid quantity **includes** the included amount, and so does each tier's `to` — the first tier's `to` must exceed `included`.
- `billingUnits` rounds usage **up** when billing.
- Set explicitly, never lean on defaults: `billingMethod`, `tierBehavior`, all three trial fields. Explicit defaults cause no spurious diffs.
- Volume tiers charge the flat amount of the reached tier and are prepaid-only; graduated (the default) sums across brackets.
- Rollover needs a resetting allowance; `max` and `maxPercentage` are mutually exclusive; `expiryDurationType` is required.
- `billingControls(...)` fields are snake_case (`feature_id`, `overage_limit`) unlike the rest of the config, and each control list replaces wholesale on update. The builder isn't validated at push — double-check feature ids and field names yourself.
- Pooled balances are config: `pooled: true` on the entity plan's item. Concluding "shared across workspaces" in Shape and then omitting the flag is the classic miss.
- Pooled grant + overage = two items on the plan: the pooled grant carries no price; a separate usage-priced item (`included: 0`) carries the overage. A pooled item can't itself be usage-priced.
- Don't write `proration` — leave it out and take server defaults.
- Not writable in config — say so and set via API or dashboard after push: display text, trial end behavior, license customization.

The config uses exactly three builders — `feature`, `plan`, `item` — as plain function calls with object arguments. Never guess other functions or fields; the full shapes are in `references/atmn.md`.

```ts
import { feature, plan, item } from "atmn";

export const credits = feature({
  id: "credits",
  name: "Credits",
  type: "credit_system",
  creditSchema: [{ meteredFeatureId: "messages", creditCost: 1 }],
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  price: { amount: 20, interval: "month" },
  items: [
    item({ featureId: credits.id, included: 500, reset: { interval: "month" } }),
  ],
});
```

Pattern deep-dives, split one file per pattern under `references/` — read the matching one when filling that pattern's details:

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
## Auto Top-Ups

Auto top-ups automatically purchase additional balance for a customer when their usage drops below a configured threshold. This prevents service interruptions for customers who don't want to manually manage their balance.

> **Example** <br />
> A customer on the Standard plan gets 5,000 credits per month. When their balance drops below 500, Autumn automatically purchases 1,000 more credits at $10 using the plan's one-off prepaid price.

## Prerequisites

Auto top-ups require:
1. A plan with a [one-off prepaid](/documentation/modelling-pricing/one-off-purchases) item for the feature you want to auto top-up
2. The customer must have a saved payment method on file

## Setting up

<Tabs>
<Tab title="CLI">

Auto top-ups are configured per customer, not in `autumn.config.ts`. Your plan needs a one-off prepaid item for the feature you want to auto top-up:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const credits = feature({
  id: 'credits',
  name: 'Credits',
  type: 'metered',
  consumable: true,
});

export const standard = plan({
  id: 'standard',
  name: 'Standard',
  price: { amount: 50, interval: 'month' },
  items: [
    item({
      featureId: credits.id,
      included: 5000,
      reset: { interval: 'month' },
    }),
    item({
      featureId: credits.id,
      price: {
        amount: 10,
        billingUnits: 1000,
        interval: 'one_off',
        billingMethod: 'prepaid',
      },
    }),
  ],
});
```

The one-off prepaid item (`$10 per 1,000 credits`) is what Autumn uses to replenish the balance. Configure auto top-ups per customer via the API (see below).

</Tab>
<Tab title="Dashboard">

1. Navigate to the **Plans** page and select (or create) the plan you want to add auto top-ups to
2. Add a new item for the feature with:
   - **Interval** set to **One-Off**
   - **Billing method** set to **Prepaid**
   - Configure the price and billing units (e.g. $10 per 1,000 credits)
3. Configure auto top-ups per customer via the API (see below)

The same feature can appear as multiple items on a plan. For example, you might have a monthly allowance of 5,000 credits **and** a one-off prepaid item for top-ups — both referencing the same feature.

</Tab>
</Tabs>

## Configuring auto top-ups via API

Set up auto top-ups for a customer by updating their billing controls:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

await autumn.customers.update({
  customerId: "user_123",
  billingControls: {
    autoTopups: [{
      featureId: "credits",
      enabled: true,
      threshold: 500,
      quantity: 1000,
    }],
  },
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

await autumn.customers.update(
    customer_id="user_123",
    billing_controls={
        "auto_topups": [{
            "feature_id": "credits",
            "enabled": True,
            "threshold": 500,
            "quantity": 1000,
        }],
    },
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/customers/update" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "billing_controls": {
      "auto_topups": [{
        "feature_id": "credits",
        "enabled": true,
        "threshold": 500,
        "quantity": 1000
      }]
    }
  }'
```

</CodeGroup>

## Auto top-up configuration

| Field | Type | Description |
|-------|------|-------------|
| `feature_id` | string | The feature to monitor |
| `enabled` | boolean | Whether auto top-up is active |
| `threshold` | number | Balance level that triggers a top-up |
| `quantity` | number | How many units to purchase each time |
| `purchase_limit` | object | Optional limit on how often top-ups can occur |

### Purchase limits

To prevent runaway spending, you can set a purchase limit:

```json
{
  "purchase_limit": {
    "interval": "month",
    "interval_count": 1,
    "limit": 5
  }
}
```

This limits the customer to 5 auto top-ups per month. Supported intervals: `hour`, `day`, `week`, `month`.

## How it works

1. After every usage event (via `track`), Autumn checks the customer's remaining balance
2. If the balance falls below the configured `threshold`, an auto top-up is triggered
3. Autumn creates an invoice for the configured `quantity` using the one-off prepaid price from the customer's plan
4. The invoice is charged to the customer's saved payment method
5. The balance is replenished with the purchased amount

Auto top-ups use burst suppression to prevent duplicate purchases when multiple track events happen in quick succession. There's a 30-second cooldown between top-ups for the same feature.

## Notifications

Subscribe to the [`billing.auto_topup_succeeded`](/api-reference/webhooks/billingAutoTopupSucceeded) webhook to be notified when a top-up grants credits. The payload includes the granted quantity, the new balance, and the underlying invoice — useful for sending receipts, updating internal ledgers, or reconciling balance after a recharge.

Subscribe to [`billing.auto_topup_failed`](/api-reference/webhooks/billingAutoTopupFailed) to monitor auto top-ups that are blocked, declined, or fail before granting balance. The payload includes a machine-readable `reason` and any available provider error details.

Limit-blocked failure webhooks are suppressed per blocking window to avoid duplicate notifications while the same limit remains active.
## Rollovers

Rollovers let unused feature balances carry forward to the next billing cycle instead of being lost at reset. This gives customers more flexibility and prevents wasted allocation.

> **Example** <br />
> A customer on a plan with 1,000 credits/month only uses 600 in January. With rollovers enabled, the remaining 400 credits carry over — giving them 1,400 credits available in February.

## Setting up

<Tabs>
<Tab title="CLI">

Add a `rollover` config to a plan item:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const credits = feature({
  id: 'credits',
  name: 'Credits',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: credits.id,
      included: 1000,
      reset: { interval: 'month' },
      rollover: {
        max: 2000,
        expiryDurationType: 'forever',
        expiryDurationLength: 1,
      },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and edit a plan
2. Select a **consumable** feature on the plan
3. Under **Advanced**, toggle on **Rollovers**
4. Set the **maximum rollover cap** — the most unused balance that can be carried over (leave empty for no cap)
5. Set the **expiry**:
   - **Forever** — rollover balances never expire
   - **Month** — rollover balances expire after a set number of months
6. Save the plan

</Tab>
</Tabs>

## Rollover configuration

| Field | Description |
|-------|-------------|
| `max` | Maximum amount that can roll over. Set to `null` for no cap. |
| `expiryDurationType` | `"forever"` (never expires) or `"month"` (expires after N months) |
| `expiryDurationLength` | Number of months until rollover balances expire. Ignored if type is `"forever"`. |

## How rollovers work

At the end of each billing cycle, when a feature's balance resets:

1. Autumn checks how much unused balance remains
2. If rollovers are configured, the unused balance is saved as a **rollover balance**
3. The feature resets to its granted amount, and the rollover is added on top
4. If a `max` cap is set, the oldest rollover balances are trimmed first (FIFO)
5. Expired rollover balances are removed automatically

## Viewing rollover balances

Rollover balances appear in the `breakdown` array when you retrieve a customer's balances. Each rollover entry has its own expiry date:

<Expandable title="customer balance with rollovers">
```json
{
  "balances": {
    "credits": {
      "included_usage": 1400,
      "balance": 1400,
      "usage": 0,
      "breakdown": [
        {
          "plan_id": "pro",
          "included_usage": 1000,
          "balance": 1000,
          "usage": 0,
          "interval": "month",
          "next_reset_at": 1745193600000
        },
        {
          "id": "roll_abc123",
          "included_usage": 400,
          "balance": 400,
          "usage": 0,
          "interval": "one_off",
          "expires_at": null
        }
      ]
    }
  }
}
```
</Expandable>

## Deduction order

Rollovers are deducted **before** a customer's main balances for the same feature. Within the rollover pool, balances are consumed in `expires_at` order: soonest-expiring first, with rollovers that never expire going last. Only once all rollover balances are drained does Autumn fall through to the regular [deduction order](/documentation/concepts/balances#deduction-order) over the main entitlements.

This means carried-over balance is used up before fresh monthly allocation, so rollovers you're about to lose to expiry get spent first.

> **Example** <br />
> A customer has a 1,000 credits/month balance that just reset, plus a 400 credits rollover from last month. They use 300 credits. <br />
> Autumn deducts all 300 from the rollover, leaving 100 credits in rollover and the full 1,000 credits monthly untouched.

Rollovers are only available on `consumable` features with a reset interval. Non-consumable features (like seats) don't reset and therefore don't support rollovers.

## Entity rollovers

If you're using [entity plans](/documentation/modelling-pricing/entity-plans), rollovers are tracked per entity. Each entity's unused balance rolls over independently.
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

When using [entities](/documentation/modelling-pricing/entity-plans) or add-ons, trial state is shared across the same Stripe subscription. This is because Stripe manages trials at the subscription level.

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
## Entity Plans

An **entity** is a resource that lives under a parent customer — a user, a workspace, a project. Entity plans let each of those hold its own plan, with its own balances, while the parent customer pays.

> **Example** <br />
> A team plan costs $30/seat/month. Each seat gets 50 AI meeting summaries per month. If a team has 5 users, each user has their own balance of 50 summaries — they can't use each other's allocation.

## Two ways to provision

Both approaches end in the same place: an entity holding a plan. They differ in **where capacity comes from**.

```
                     an entity holds a plan
                              │
         ┌────────────────────┴────────────────────┐
    attach directly                            licenses
    ───────────────                            ────────
    capacity = whoever you attached            capacity = a pool of seats you bought
    charged when the entity is attached        charged when the seats are bought
    no unassigned state                        seats can sit empty, be reassigned
```

Pick with one question: **do you sell capacity before you know who fills it?**

| | Attach directly | Licenses |
|---|---|---|
| **Use when** | Entities appear and you bill for them as they do | Customers commit to a seat count upfront |
| **Buying** | `billing.attach` per entity | `licenseQuantities` on the parent plan |
| **Provisioning** | Same `billing.attach` call | `licenses.attach` assigns from the pool |
| **Removing** | `billing.update` with a cancel action | `licenses.release` returns the seat to the pool |
| **Empty seats** | Not possible | Bought but unassigned seats are normal |

Different tiers per entity work in **both** modes — attach different plans to different entities, or offer more than one license plan under the same parent.

Entities are created with a `feature_id` identifying their type (e.g. a non-consumable `seats` or `workspaces` feature). If you only need to *count* seats and bill for them, with no per-seat balances or identity, you don't need entities at all — see [per-seat pricing](/documentation/modelling-pricing/per-unit-pricing).

## Attaching plans directly

Create your plans as normal — no entity-specific configuration on the plan itself. Put plans that should replace each other on upgrade/downgrade in the same `group`.

<Tabs>
<Tab title="CLI">

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const requests = feature({
  id: 'requests',
  name: 'API Requests',
  type: 'metered',
  consumable: true,
});

export const workspaceFree = plan({
  id: 'workspace_free',
  name: 'Workspace Free',
  group: 'workspace',
  items: [
    item({
      featureId: requests.id,
      included: 100,
      reset: { interval: 'month' },
    }),
  ],
});

export const workspacePro = plan({
  id: 'workspace_pro',
  name: 'Workspace Pro',
  group: 'workspace',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: requests.id,
      included: 10000,
      reset: { interval: 'month' },
    }),
  ],
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Create your plan tiers as normal (e.g. "Workspace Free", "Workspace Pro")
2. Set the same **group** on plans that should replace each other on upgrade/downgrade
3. Entity-level attachment is handled via the API — no extra dashboard configuration needed

</Tab>
</Tabs>

#### Create the entity

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

await autumn.entities.create({
  customerId: "org_123",
  entityId: "workspace_a",
  featureId: "workspaces",
  name: "Workspace A",
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

await autumn.entities.create(
    customer_id="org_123",
    entity_id="workspace_a",
    feature_id="workspaces",
    name="Workspace A",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/entities.create" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "entity_id": "workspace_a",
    "feature_id": "workspaces",
    "name": "Workspace A"
  }'
```

</CodeGroup>

#### Attach a plan to it

Pass `entityId` to scope the attach to that entity:

<CodeGroup>

```typescript TypeScript
await autumn.billing.attach({
  customerId: "org_123",
  planId: "workspace_pro",
  entityId: "workspace_a",
});
```

```python Python
await autumn.billing.attach(
    customer_id="org_123",
    plan_id="workspace_pro",
    entity_id="workspace_a",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "workspace_pro",
    "entity_id": "workspace_a"
  }'
```

</CodeGroup>

Each entity's subscription is created separately in Stripe, with billing cycles synced to the parent customer.

To upgrade or downgrade, attach the new plan with the same `entityId` — the usual [upgrade/downgrade](/documentation/customers/subscription-lifecycle) logic applies.

#### Cancel an entity's plan

<CodeGroup>

```typescript TypeScript
await autumn.billing.update({
  customerId: "org_123",
  planId: "workspace_pro",
  entityId: "workspace_a",
  cancelAction: "cancel_end_of_cycle",
});
```

```python Python
await autumn.billing.update(
    customer_id="org_123",
    plan_id="workspace_pro",
    entity_id="workspace_a",
    cancel_action="cancel_end_of_cycle",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.update" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "workspace_pro",
    "entity_id": "workspace_a",
    "cancel_action": "cancel_end_of_cycle"
  }'
```

</CodeGroup>

The same [cancel/uncancel](/documentation/customers/subscription-lifecycle#cancellations) behavior applies.

## Licenses

A **license plan** describes everything one entity gets. The parent plan offers a pool of them, and you assign one to an entity to hand it its own balance.

```
team plan  ──licenses: [{ seat, included: 1 }]──►  pool of seats
                                                     │
                                    licenses.attach  │  licenses.release
                                                     ▼
                              entity "user_alice"  ──►  own balance: 50 summaries/mo
```

The pool has a `granted` size (included seats plus any paid seats), a `usage` count (seats currently assigned), and a `remaining` count. Assigning consumes a seat; releasing gives it back.

<Tabs>
<Tab title="CLI">

Create the feature each seat consumes, then a license plan holding what one seat gets. Link it from the parent plan via `licenses`:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const summaries = feature({
  id: 'summaries',
  name: 'Meeting Summaries',
  type: 'metered',
  consumable: true,
});

// Everything one seat gets, priced per seat.
export const seat = plan({
  id: 'seat',
  name: 'Seat',
  group: 'licenses',
  price: { amount: 30, interval: 'month' },
  items: [
    item({
      featureId: summaries.id,
      included: 50,
      reset: { interval: 'month' },
    }),
  ],
});

export const team = plan({
  id: 'team',
  name: 'Team',
  licenses: [
    { licensePlanId: seat.id, included: 1 },
  ],
});
```

`included: 1` means the Team plan comes with one free seat. Seats beyond that are paid at the license plan's own price.

Push changes with `atmn push`.

Give the license plan its own `group`. Attaching a plan replaces other plans in the same group, so a license plan sharing a group with its parent would knock the parent off.

</Tab>
<Tab title="Dashboard">

1. Navigate to **Plans** and create the license plan (e.g. "Seat") — give it its own group, its per-seat price, and the features one seat receives (e.g. 50 Meeting Summaries per month)
2. Create or edit the parent plan (e.g. "Team")
3. Under **Licenses**, add the Seat plan and set how many seats are **included**
4. Save the plan

</Tab>
</Tabs>

#### Buy seats

Seats are bought on the parent plan. `quantity` is the **total** number of seats, including the plan's free `included` amount:

<CodeGroup>

```typescript TypeScript
await autumn.billing.attach({
  customerId: "org_123",
  planId: "team",
  licenseQuantities: [{
    licensePlanId: "seat",
    quantity: 5,
  }],
});
```

```python Python
await autumn.billing.attach(
    customer_id="org_123",
    plan_id="team",
    license_quantities=[{
        "license_plan_id": "seat",
        "quantity": 5,
    }],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/billing.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "team",
    "license_quantities": [
      { "license_plan_id": "seat", "quantity": 5 }
    ]
  }'
```

</CodeGroup>

With 1 included seat and `quantity: 5`, the customer gets 5 seats and pays for 4. Attach again with a new `quantity` to change the count later — Autumn prorates the difference.

A **priced** license plan must be attached at the customer level before it can be assigned to entities. Buying seats with `licenseQuantities` does this for you.

#### Assign a license

Assigning is what provisions the entity's individual balance — creating an entity on its own does not:

<CodeGroup>

```typescript TypeScript
await autumn.licenses.attach({
  customerId: "org_123",
  planId: "seat",
  entities: [
    { entityId: "user_alice", name: "Alice", featureId: "seats" },
  ],
});
```

```python Python
await autumn.licenses.attach(
    customer_id="org_123",
    plan_id="seat",
    entities=[
        {"entity_id": "user_alice", "name": "Alice", "feature_id": "seats"},
    ],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.attach" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "plan_id": "seat",
    "entities": [
      { "entity_id": "user_alice", "name": "Alice", "feature_id": "seats" }
    ]
  }'
```

</CodeGroup>

`feature_id` is the entity type and is required only when the entity doesn't exist yet — Autumn creates it for you. You can pass several entities in one call.

Assignment is idempotent. Re-assigning an entity that already holds an active license for the same plan succeeds without consuming another seat. If the pool has no seats left, the call errors — buy more seats first.

#### Release a license

The entity's balance is removed and the seat returns to the pool, ready to reassign:

<CodeGroup>

```typescript TypeScript
await autumn.licenses.release({
  customerId: "org_123",
  licensePlanId: "seat",
  entityIds: ["user_alice"],
});
```

```python Python
await autumn.licenses.release(
    customer_id="org_123",
    license_plan_id="seat",
    entity_ids=["user_alice"],
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.release" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "license_plan_id": "seat",
    "entity_ids": ["user_alice"]
  }'
```

</CodeGroup>

Releasing frees the seat but does not change what the customer pays — they keep the seats they bought. To stop paying for one, attach the parent plan again with a lower `quantity`.

`license_plan_id` is optional, and only needed to disambiguate when an entity holds licenses from more than one plan.

#### Inspect seats

[`licenses.list`](/api-reference/licenses/listLicenses) returns each pool with its `granted`, `usage`, and `remaining` counts. [`licenses.list_assignments`](/api-reference/licenses/listLicenseAssignments) returns which entities currently hold one.

```bash cURL
curl -X POST "https://api.useautumn.com/v1/licenses.list" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{ "customer_id": "org_123" }'
```

## Checking and tracking per entity

Regardless of how the entity got its plan, pass `entity_id` to `check` and `track` to operate on that entity's balance:

<CodeGroup>

```typescript TypeScript
const { data } = await autumn.check({
  customer_id: "org_123",
  feature_id: "summaries",
  entity_id: "user_alice",
});

console.log(data.allowed);
console.log(data.balance);
```

```python Python
response = await autumn.check(
    customer_id="org_123",
    feature_id="summaries",
    entity_id="user_alice",
)

print(response.allowed)
print(response.balance)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/check" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "feature_id": "summaries",
    "entity_id": "user_alice"
  }'
```

</CodeGroup>

Track the same way:

<CodeGroup>

```typescript TypeScript
await autumn.track({
  customer_id: "org_123",
  feature_id: "summaries",
  entity_id: "user_alice",
  value: 1,
});
```

```python Python
await autumn.track(
    customer_id="org_123",
    feature_id="summaries",
    entity_id="user_alice",
    value=1,
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/track" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "org_123",
    "feature_id": "summaries",
    "entity_id": "user_alice",
    "value": 1
  }'
```

</CodeGroup>

### Customer-level vs entity-level

| Level | How to use | Behavior |
|-------|-----------|----------|
| **Entity-level** | Pass `entity_id` in check/track | Checks/deducts from that entity's individual balance |
| **Customer-level** | Omit `entity_id` | Returns the total balance across all entities |

When tracking at the customer level (without `entity_id`), usage is deducted from the first-assigned entity to keep entity-level totals in sync with the customer-level total.

## Worked example

[Entity-level balances](/examples/entity-balances) walks the licenses model end to end: an AI meeting-notes product on team pricing, from customer creation through buying seats, assigning them, and releasing them when someone leaves.
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

const response = await autumn.check({
  customerId: "user_123",
  featureId: "premium_request",
  requiredBalance: 6,
});

console.log(response.allowed);
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_1234")

response = await autumn.check(
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

await autumn.track({
  customerId: "user_123",
  featureId: "premium_request",
  value: 6,
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_test_1234")

await autumn.track(
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
## Add-Ons

Add-ons are plans that can be purchased alongside a customer's existing plan, rather than replacing it. They're used for top-ups, extra feature packs, or supplementary services.

> **Example** <br />
> A customer on the Pro plan can purchase a "Storage Add-On" for an extra 100GB/month, or a one-time "Credit Top-Up" of 500 credits.

## Setting up

<Tabs>
<Tab title="CLI">

Set `addOn: true` on the plan:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const storage = feature({
  id: 'storage',
  name: 'Storage (GB)',
  type: 'metered',
  consumable: false,
});

export const credits = feature({
  id: 'credits',
  name: 'Credits',
  type: 'metered',
  consumable: true,
});

export const storageAddOn = plan({
  id: 'storage_add_on',
  name: 'Extra Storage',
  addOn: true,
  price: { amount: 5, interval: 'month' },
  items: [
    item({
      featureId: storage.id,
      included: 100,
    }),
  ],
});

export const creditTopUp = plan({
  id: 'credit_top_up',
  name: 'Credit Top-Up',
  addOn: true,
  items: [
    item({
      featureId: credits.id,
      price: {
        amount: 10,
        billingUnits: 500,
        billingMethod: 'prepaid',
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
3. Toggle the **Add-on** flag
4. Configure the price and features as needed
5. Click **Create**

</Tab>
</Tabs>

## How add-ons work

Without the add-on flag, attaching a new plan replaces the customer's current plan (within the same [group](/documentation/concepts/plans#plan-properties)). With the add-on flag:

- The plan is **added alongside** the customer's existing plans
- Multiple add-ons can be active at the same time
- Add-ons don't participate in upgrade/downgrade logic

## Balance stacking

When an add-on provides the same feature as the customer's main plan, the balances [stack](/documentation/concepts/balances#balance-stacking). Each source is tracked separately in the `breakdown` array.

> **Example** <br />
> A customer's Pro plan grants 1,000 credits/month. They purchase a one-time top-up of 500 credits. Their total balance is 1,500 credits, tracked as two separate sources.

Autumn uses [deduction order](/documentation/concepts/balances#deduction-order) to consume shorter-interval balances first (monthly before lifetime).

## Purchasing add-ons

Add-ons use the same checkout/attach flow as regular plans:

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({ secretKey: "am_sk_..." });

const { data } = await autumn.checkout({
  customer_id: "user_123",
  plan_id: "storage_add_on",
});
```

```python Python
from autumn_sdk import Autumn

autumn = Autumn("am_sk_...")

response = await autumn.checkout(
    customer_id="user_123",
    plan_id="storage_add_on",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/checkout" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "storage_add_on"
  }'
```

</CodeGroup>

For prepaid add-ons (like a credit top-up), pass the quantity:

```typescript TypeScript
const { data } = await autumn.checkout({
  customer_id: "user_123",
  plan_id: "credit_top_up",
  options: [{
    feature_id: "credits",
    quantity: 1000,
  }],
});
```

## Cancelling add-ons

Cancel an add-on using the same [cancel](/documentation/customers/subscription-lifecycle#cancellations) flow:

<CodeGroup>

```typescript TypeScript
await autumn.cancel({
  customer_id: "user_123",
  plan_id: "storage_add_on",
});
```

```python Python
await autumn.cancel(
    customer_id="user_123",
    plan_id="storage_add_on",
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/cancel" \
  -H "Authorization: Bearer am_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "plan_id": "storage_add_on"
  }'
```

</CodeGroup>

## Common add-on patterns

| Pattern | Configuration |
|---------|---------------|
| Recurring add-on | `addOn: true`, recurring price (e.g., $5/month for extra storage) |
| One-time top-up | `addOn: true`, prepaid price, no base price |
| Feature pack | `addOn: true`, grants boolean or metered features |
## Plan Variants

Plan variants let you model multiple versions of the same offer without duplicating the full plan. The base plan holds the shared definition, and each variant stores only the differences: usually a price change, an added item, or a different usage allowance.

> **Example** <br />
> A Pro plan has the same core features for every customer, but is sold monthly, annually, and as a higher-volume package. Model these as variants of `pro` instead of three unrelated plans.

Variants are most useful for:

- Monthly vs annual billing intervals
- A/B testing plan packages
- Volume ladders that share most features but differ in included usage or overage price

## Setting up

<Tabs>
<Tab title="CLI">

Define variants from a base plan in `autumn.config.ts`:

```ts autumn.config.ts
import { feature, item, plan } from 'atmn';

export const emails = feature({
  id: 'emails',
  name: 'Emails',
  type: 'metered',
  consumable: true,
});

export const pro = plan({
  id: 'pro',
  name: 'Pro',
  price: { amount: 20, interval: 'month' },
  items: [
    item({
      featureId: emails.id,
      included: 10000,
      price: {
        amount: 1,
        billingUnits: 1000,
        billingMethod: 'usage_based',
        interval: 'month',
      },
    }),
  ],
});

export const proAnnual = pro.variant({
  id: 'pro_annual',
  name: 'Pro Annual',
  customize: {
    price: { amount: 200, interval: 'year' },
  },
});

export const pro100k = pro.variant({
  id: 'pro_100k',
  name: 'Pro 100k',
  customize: {
    price: { amount: 35, interval: 'month' },
    removeItems: [{ featureId: emails.id, billingMethod: 'usage_based' }],
    addItems: [
      item({
        featureId: emails.id,
        included: 100000,
        price: {
          amount: 0.9,
          billingUnits: 1000,
          billingMethod: 'usage_based',
          interval: 'month',
        },
      }),
    ],
  },
});
```

Push changes with `atmn push`.

</Tab>
<Tab title="Dashboard">

1. Create or open the base plan
2. Create a variant from that plan
3. Change only the fields that differ, such as price or specific feature items
4. Save the variant

</Tab>
</Tabs>

## How variants work

Each variant is still a plan you can attach by ID, such as `pro_annual` or `pro_100k`. The difference is that Autumn keeps it connected to the base plan.

Use variants when plans share most of their features. If a variant changes many unrelated parts of the plan, create a separate plan instead.

## Conduct

- In an existing config, match its patterns: if sibling plans carry their prepaid purchases as items, the new plan does too — don't introduce a different structure for the same kind of thing.
- Stable lowercase IDs with underscores: `pro_plan`, `chat_messages`.
- `entityFeatureId` is deprecated. Never mention or use it unless the user's existing config already has it.
- Per-unit pricing pairs a base fee with the per-unit item ("$X/seat" plans still have a base price, even $0).
- Speak plainly: "plans", "what's included", "extra usage". Schema words stay in the config — say "carry over" not "rollover", "shared across workspaces" not "pooled", "paid upfront" / "billed at month end" not "prepaid" / "usage_based".
- Never volunteer what Autumn can or can't do. Don't offer options Autumn can't model, and don't explain limitations unprompted — only address one when the user directly asks to model that specific thing, and even then lead with the closest thing that works.
- Start simple: the most important features first, confirm before adding more.

Before finishing: re-check the STRICT RULES at the top against the config you wrote.

## Catalog operations

# atmn catalog flows

Use `atmn` when a project has or should have an `autumn.config.ts` source of truth.

Commands — these two, not `atmn preview` (that is an interactive UI):

```sh
atmn --headless push          # validates, previews the diff — and applies when no decisions are needed
atmn --headless push --yes    # apply, auto-confirming pending decisions
```

`--headless push` without `--yes` only stops when the diff needs decisions (versioning, deletions, prod). On a clean target — a new org, a plain create — it validates and applies in one step, so treat running it as pushing, not as a dry run.

## When to use it

- New project: ask whether to use `atmn` to build and push the catalog. Recommend it for code-managed catalogs.
- Existing project: if `autumn.config.ts` exists, inspect and edit it before pushing.
- Use MCP/API directly when the user wants dashboard/API-first changes or there is no local config workflow.

## Config shapes

`autumn.config.ts` uses the atmn package types, not raw API JSON. Field names are camelCase: `featureId`, `billingMethod`, `billingUnits`, `freeTrial`, `addItems`, `removeItems`, `intervalCount`. Follow the exported types from the package when editing config. Amounts are plain dollars: $20 is `20`, never `2000`.

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

# Catalog update flow

Use this when the user is already running Autumn — customers are on these plans — and wants to change pricing or plans. (A half-built config from an earlier setup session is NOT this: keep building with the normal workflow.) This workflow is still growing — the ground rules below always apply; the rest of this file carries the preview/decide/apply mechanics.

## Ground rules

- **Never run the new-catalog interview against a live catalog.** Read `autumn.config.ts` (or `atmn pull`) first; the existing catalog is the truth to diff against, not a draft to replace.
- **Touch only what the change names.** Every other plan, item, and id stays byte-identical — rewriting untouched plans is the classic update failure.
- **Match the existing config's patterns** — if sibling plans model a thing one way, the change follows that way.
- The questions here are "who's affected", not "what do you sell": new version or update in place? propagate to variants or not? migrate existing customers or grandfather them? Never decide these alone — preview, show the choices, let the user pick.
- Structural changes ("add seats", "make credits shared") re-enter the Shape forks (licenses, pooled, add-on, variants) exactly as a new catalog would.
- Preview before every write, apply only the exact previewed change.

## Loop

1. Inspect the current catalog and the proposed catalog.
2. Build `catalog.preview_update` params: `features`, `plans`, optional `skip_deletions`, `skip_feature_ids`, `skip_plan_ids`, `expand`.
3. Run `catalog.preview_update`; never skip this before a write.
4. Summarize the preview and ask for decisions per feature and per base plan family.
5. Revise params or config based on the decisions, then preview again if anything changed.
6. Run `catalog.update` with the exact previewed params, following the global write approval rules.

For single-plan updates, pass that plan inside `catalog.preview_update.plans[]`. Include `include_versions: true` and `include_variants: true` when the plan has customers, historical versions, or variants so the user can choose the right scope.

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
