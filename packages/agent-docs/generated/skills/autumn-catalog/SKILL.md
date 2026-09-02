---
name: autumn-catalog
description: Modeling a user's pricing into an Autumn catalog — deciding the structure (plans, variants, add-ons, licenses, credit systems, pooled balances) before writing config, then filling in the numbers. Use when the user describes their pricing or asks to model, change, or push a catalog.
---

# Catalog

Before using this skill, first load the `autumn-concepts` skill — it defines Autumn's data model — features, plans, plan items, balances — which every modeling decision builds on.

Turning pricing into a catalog is two jobs:

- **Shape** — decide the structure: which plans exist, what's a variant, what's an add-on, where balances live. Decided by relationships in their pricing, not by amounts.
- **Fill** — put in the numbers and per-item details, then write and validate the config.

Do Shape fully before Fill. Take numbers whenever the user mentions them, but never chase numbers during Shape — the one exception is "is this the same on every plan?", which is a structure question.

## Progress (what the user sees)

Copy this checklist into your first message and keep it up to date. It is the **only** structure the user ever sees — never say "step", "pass", "decide", or "fork" to them. If you skip an item, say why in one line.

- [ ] 1 Your plans and prices
- [ ] 2 What's included in each plan
- [ ] 3 How billing behaves (signup, trials, limits)
- [ ] 4 Seats (if any)
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

- **Signup**: every new customer automatically gets the default plan — usually the free one. One default per group.
- **Trials**: ask "does the trial need a card?" (guess from their motion — PLG usually no).
  - Card → a free trial on the paid plan; checkout happens, billing starts when the trial ends.
  - No card → the paid plan itself gets a no-card trial and becomes the default: everyone starts on a Pro trial, and lands on the free plan when it expires. Same plan, not a separate one.
- **What is a plan attached to?** The customer, or each thing they own (deployment, workspace)? "Pro is $200 per deployment" → attached per entity. Pin this down — it changes everything downstream.
- **Who uses each metered feature?** The customer as a whole, or each entity? If entities: one shared balance or separate ones? "Shared across…" → shared ↦ Decide (balances).

Done when you know what attaches where, who consumes what, and how trials and signup work.

### Step 4 — Seats

Only if seats are paid. One question decides it: **does a seat grant anything?**

- "$10 per seat", nothing granted → a per-unit priced item on the plan. No entities. The common case.
- "Each seat gets 100 credits" → the seat grants something → a **license**: a small plan of its own that the parent plan hands out per seat.
- Seats must be assigned, reassigned, or sit empty → also licenses. Rare — confirm they need it.

For deciding between a per-unit seat item, licenses, and entity-attached plans, read `references/fork-licenses.md`.

### Before deciding: restate

Only after your questions are answered — never announce it in advance, and never restate facts nobody has confirmed yet. One short message: the plans, what's metered, what attaches where, who shares what. Let the user correct it. A wrong fact here is much cheaper than a wrong structure later.

If the user gave you everything up front and you asked nothing, skip the separate restate — the structure message (checklist item 5) does that job.

## Decide

Resolve these with all facts in hand. Each has a default — when the facts genuinely don't settle it, show both options in one line each and ask.

**Variant or separate plan?**
A variant can change the price, swap items in or out, and change the trial — nothing else.

- "Pro monthly / Pro annual, same features" → variant. (Annual usually still resets allowances monthly — billing and reset intervals are independent. Confirm.)
- Volume buckets ("$20 for 50k emails, $35 for 100k…") — two valid shapes, one question decides: **does anything besides price and volume differ per bucket?**
  - Overage rate or features differ per bucket → one plan (or variant) per bucket. Each bucket's flat price is that plan's **base price** with the volume included, and each carries its own overage item.
  - Nothing else differs → one plan whose price IS a prepaid volume-tiered item (no base price); the customer picks the bucket at purchase.
- Different features per tier → separate plans. One plan per tier is normal, not a smell.

**Add-on, or part of the plan?**
- Optional, buyable alongside any plan, one definition shared across plans → its own add-on plan: `addOn: true`, and the purchase itself is a prepaid-priced item (`price: { billingMethod: "prepaid", ... }`) — not a base price. Add-ons attach next to the base plan without replacing it, and their balances stack with the plan's.
- In every subscription of the plan, or priced differently per plan → an item on the plan.
- Top-ups follow the same rule: opt-in and shared across plans → add-on; bundled with or priced per plan → a one-off prepaid item on that plan. Auto-recharge needs that one-off prepaid item to exist — add it in Shape, it's structural.

**Where do balances and purchases live?**
The rule: **purchases and balance at the customer; usage tracking and caps at the entity.**
- "Each deployment gets 10k credits, packs are shared across deployments" → deployment grants are pooled into one shared customer balance; packs are a customer-level add-on. Packs on the pro plan would strand credits on one deployment.
- Each entity keeps its own separate balance and cap → no pooling; the entity's own plan carries the allowance.
- A per-entity cap on a shared balance is a usage limit (billing control), not a separate balance.
- Heads-up: pooled items can't be written in `autumn.config.ts` yet — model the rest in config, then set pooling via the API or dashboard, and say so to the user.

For deciding where balances and purchases live — pooled grants, customer-level packs, read `references/fork-pooled.md`.

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

For checking the derived structure against known-good shapes, read `references/cases.md`.

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
Credit pack (add-on) — price TBD, shared across all deployments
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
- **Anything else on/off** — always, it's cheap: "Any other on/off differences between plans — SSO, priority support, API access?"

The sweep exists so the user hears what's configurable without being marched through every item. Behind it, check every knob yourself — this list is internal, never show it:

- per plan: base price · trial (length, unit, card — all explicit) · default plan · group
- per item: billing method · included · price or tiers (tier behavior explicit) · reset · rollover · purchase caps · the one-off item auto-recharge needs

**4 — Propose, then finalize.** One message: the full catalog in the format below, then "I assumed:" listing every knob you defaulted. Fold corrections in. Then write the config, validate with `atmn --headless push` (a preview — it writes nothing), fix what it flags, and show the final catalog — same format, no assumptions list. **Done means the config is written and valid — a summary is not done.**

Applying to Autumn (`atmn --headless push --yes`) is a separate, explicit step: only after the user has seen the final catalog and clearly said to push it. Never apply on your own — offer it ("Want me to push this to your sandbox?") and stop.

### Showing the catalog

Use **exactly this format** every time you show the catalog — the Show structure message, the Fill proposal, and the done message alike. Never a markdown table, never a different layout per message. Send it as a fenced code block (```) so the indentation survives markdown rendering — plan names on bare lines otherwise get folded into the previous plan's list. It's the same grammar the dashboard renders. Features first with their kind, then plans, one line per item:

```
Features: AI messages (usage, resets) · Seats (held, not used up) · Credits (credit system — 1 message = 1 credit) · SSO (on/off)

Pro — $20/month
  - 500 AI messages per month
  - 500 AI messages per month, then $0.01 per message
  - $10 per 1,000 credits
  - 5,000 credits for $50 per month
  - 3 seats included, then $10 per seat
  - $18 - $15 per seat
  - Unlimited projects
  - SSO
  - 100 credits per seat per month
Credit pack (add-on) — $10 for 1,000 credits, buy anytime
```

The Features line names every feature and its kind in plain words: `(usage, resets)` for consumable meters, `(held, not used up)` for non-consumable ones like seats, `(credit system — …)` with its action mappings, `(on/off)` for boolean. Item lines, top to bottom: plain allowance · allowance with overage · pure usage price (per billing unit) · prepaid bucket · included + prepaid per-unit · tiered rate shown first-to-last · unlimited · boolean (name only, never "enabled") · per-entity grant · one-off add-on. Numbers get commas; "then …" says what happens after the included runs out; annual variants go inline ("or $200/year — messages still reset monthly").

### Config gotchas

- Amounts are plain dollars: $20 is `20`, never `2000`.
- A default/auto-enabled plan can't be paid: no base price, no paid items.
- A prepaid quantity **includes** the included amount, and so does each tier's `to` — the first tier's `to` must exceed `included`.
- `billingUnits` rounds usage **up** when billing.
- Set explicitly, never lean on defaults: `billingMethod`, `tierBehavior`, all three trial fields. Explicit defaults cause no spurious diffs.
- Volume tiers charge the flat amount of the reached tier and are prepaid-only; graduated (the default) sums across brackets.
- Rollover needs a resetting allowance; `max` and `maxPercentage` are mutually exclusive; `expiryDurationType` is required.
- Don't write `proration` — leave it out and take server defaults.
- Not writable in config — say so and set via API or dashboard after push: pooled balances (if Shape chose them), display text, trial end behavior, license customization.

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

For charging for usage beyond an included allowance, read `references/usage-based-pricing.md`.

For selling a quantity bought upfront (seats, credit packs, buckets), read `references/prepaid-pricing.md`.

For pricing that changes by volume tier, read `references/volume-based-tiers.md`.

For modeling $X per unit — always with a base fee, read `references/per-unit-pricing.md`.

For recurring plans; billing interval vs reset interval, read `references/recurring.md`.

For one-off purchases or top-up items, read `references/one-off-purchases.md`.

For auto-recharge behavior and the one-off prepaid item it requires, read `references/auto-top-ups.md`.

For unused allowance carrying over, read `references/rollovers.md`.

For trial details — durations, card behavior, what happens on expiry, read `references/trials.md`.

For entity-scoped plans and licenses — attach flows, provisioning, read `references/entity-plans.md`.

For credit schemas, action mappings, monetary credits, read `references/credit-systems.md`.

For default plans and auto-enable rules, read `references/free-plans.md`.

For add-on plans and balance stacking, read `references/add-ons.md`.

For creating variants — what they can and cannot change, read `references/plan-variants.md`.

## Conduct

- Never invent a price, limit, or plan name — ask.
- Stable lowercase IDs with underscores: `pro_plan`, `chat_messages`.
- One feature per real thing: one `tokens` feature with different items, never `monthly_tokens` + `one_time_tokens`.
- `entityFeatureId` is deprecated. Never mention or use it unless the user's existing config already has it.
- Per-unit pricing pairs a base fee with the per-unit item ("$X/seat" plans still have a base price, even $0).
- Speak plainly: "plans", "what's included", "extra usage". Schema words stay in the config — say "carry over" not "rollover", "shared across workspaces" not "pooled", "paid upfront" / "billed at month end" not "prepaid" / "usage_based".
- Start simple: the most important features first, confirm before adding more.

## Catalog operations

For using atmn, autumn.config.ts, or headless push flows, read `references/atmn.md`.

For changing an existing catalog: previewing, versioning, migrations, variant propagation, read `references/catalog-update.md`.
