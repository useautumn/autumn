# Worked cases

Five archetypes, each chosen because it teaches one structural fork. They are shapes, not current company pricing — the numbers are illustrative.

## 1. Docs platform with per-deployment credits (F4: pooled)

Pitch: "Pro is $200/mo per deployment and includes 10k AI credits. Teams can buy credit packs and enable overage — shared across all their deployments."

- Naive: prepaid pack + overage items on the pro plan. Packs land on one deployment's balance; "shared" is broken.
- Structure: pro attached per deployment with a `pooled` credit item (each deployment's 10k joins one org balance); packs + overage on an org-level add-on plan.
- The deciding fact: purchases are shared, allowances are per-deployment. Purchase and balance at the org; grants and attribution at the entity.

## 2. Team plan where seats carry credits (F3: licenses)

Pitch: "Team is $40/seat/month; every seat gets 100 summaries a month."

- Naive: per-unit seat item + one big summaries allowance on the team plan. The allowance doesn't scale with seats and seats have no identity.
- Structure: a seat license plan (own group) priced $40 granting 100 summaries; the team plan offers it via `licenses`.
- The deciding fact: the seat *grants something*. Count-only seats would stay a per-unit item with no entities at all.

## 3. Email API tier ladder (F1: plan-per-tier)

Pitch: "$20/mo for 50k emails, $35 for 100k, $60 for 200k — overage $0.90/1k, $0.70/1k, $0.45/1k respectively."

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
