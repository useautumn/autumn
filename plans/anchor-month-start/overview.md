---
author: john
feature: anchor-month-start
date: 2026-09-27
status: units 1–5 implemented (uncommitted); scheduled switches deferred
---

# Anchor plans to the 1st of the month (plan config)

## Verdict

`anchor_to_month_start` is not a new mechanism. It is an **implicit
`billing_cycle_anchor` request**: when the incoming plan is flagged and the
caller passed no anchor, setup fills in the next 1st (00:00 UTC). Everything
downstream is the existing future-anchor feature.

That feature has one gap, and it is already broken on dev: a **new**
subscription never receives the anchor. `setupBillingCycleAnchor` puts the
future anchor into `billingCycleAnchorMs` (commit d3822dddfb), so line items
prorate to it, but `subscriptions.create` sends Stripe no anchor and charges a
full period. The same flip also makes existing-sub charges prorate to the
anchor instead of the current period end, and moves scheduled switches to the
anchor. That is why 7 `billing-cycle-anchor` tests fail on dev today.

Fixing that gap first (unit 1) is what makes the flag cheap: after it, a
flagged plan is one `??` in setup.

```
requested anchor (explicit param ?? month-start flag)
        |
        v
+-------------------------+     +----------------------------------+
| no Stripe subscription  |     | existing Stripe subscription     |
| billingCycleAnchorMs=A  |     | billingCycleAnchorMs = current   |
| Stripe create: anchor A |     | resets_at = A (schedule phase,   |
| stub now->A prorated,   |     |  phase_start, always_invoice)    |
| or $0 with "none"       |     | charge now = ordinary diff to    |
| resets on A             |     |  current period end              |
+-------------------------+     +----------------------------------+
  NEW (unit 1)                    EXISTING, unchanged (ff9b094c59)
```

## Decisions

| #  | Decision | Status |
|----|----------|--------|
| A1 | Plan-level `config.anchor_to_month_start: boolean`, default false, `products.config` jsonb, no migration. | agreed |
| A2 | Deprecate org `anchor_start_of_month` (v1 only; anchored to the 1st at 12:00 UTC). | agreed |
| A3 | The **incoming** plan decides. | agreed |
| A5 | Annual plans anchor to the next 1st, then yearly. | agreed |
| A6 | 00:00 UTC. | agreed |
| A7 | Explicit `billing_cycle_anchor` param wins over the flag. | agreed |
| A8 | Weekly and daily plans ignore the flag (`isProductAnchoredToMonthStart`). | agreed |
| A9 | Only attach-family setups read the flag: attach, multi-attach, create-customer defaults, cancel → default plan. `updateSubscription`, `createSchedule`, migrations never do (a config patch must not re-anchor live subs). | agreed |
| D-A | New sub + future anchor (explicit or flag) = native Stripe `billing_cycle_anchor` on create and on Checkout. `proration_behavior` "none" → no invoice until the anchor. `billing-cycle-anchor-new-plan` 1–2 now expect the prorated stub. Existing-sub behaviour untouched. | agreed |
| D-B | Existing sub + flagged plan = the existing scheduled anchor reset: today's charge covers the current cycle, the phase at the 1st credits unused days and bills the new period. Skipped when the sub's anchor already falls on a 1st (day-of-month, so legacy 12:00 anchors count). Subscription-wide. | agreed |
| D-C | `billingPeriod` is always the anchor-aligned cycle (proration basis). The `sub.created` clip moved to the in-arrear `effectivePeriod`. Verified: trial edge cases unchanged; one entities test moved by 2¢ because its helper copied the old floor. | agreed |
| D-D | **Scheduled switches keep the outgoing cycle's date.** A downgrade to a flagged plan starts at the paid cycle's end and resets from there; the flag only applies to plans starting now. Revisit if a customer needs it. | agreed |
| D4 | Trials: flag ignored while trialing; anchor = trial end (existing override). Re-anchoring at trial end is out of scope. | proposed |
| D5 | Multi-attach: every recurring incoming product must be flagged. | proposed |

## Case matrix

"1st" = next 1st at 00:00 UTC strictly after the plan's start.

**No subscription (native anchor)**
| #  | Scenario | Expect |
|----|----------|--------|
| c1 | new customer, flagged default free plan | next_reset_at = 1st |
| c2 | no plan → flagged free | next_reset_at = 1st |
| c3 | no sub → flagged paid monthly | Stripe anchor = 1st; invoice = prorated stub; preview = invoice; resets on 1st |
| c3b | c3 with `proration_behavior: "none"` | preview 0, no invoice, access now, anchor + resets = 1st |
| c4 | c3 via Checkout | `subscription_data.billing_cycle_anchor` = 1st; then as c3 |
| c5 | flagged annual | anchor = 1st, stub prorated over the year, renews yearly on that 1st |
| c6 | multi-attach two flagged plans | one sub anchored to the 1st |
| c7 | flagged plan, explicit `"now"` | explicit wins |
| c8 | flag off | unchanged (regression guard) |
| c9 | free (20th) → flagged free | resets move to the 1st (requested wins over Free→Free keep-starts_at) |
| c10 | free (20th) → flagged paid | new sub anchored to the 1st |
| c17 | attach at 00:00:xx on the 1st | anchor = following 1st, ~full-month stub |

**Existing subscription (scheduled reset)**
| #  | From | To (flagged) | Expect |
|----|------|--------------|--------|
| c11 | paid on the 1st | paid upgrade | no request; ordinary upgrade, anchor stays |
| c12 | paid on the 20th | paid upgrade | charge = diff to Oct 20 now; resets_at = 1st; at the 1st: phase reset, credit + new period; next_reset_at = 1st |
| c12b | paid on the 20th | paid downgrade end_of_cycle | switch at Oct 20, keeps the 20th (D-D) |
| c15 | main on the 20th | flagged add-on | whole sub re-anchors to the 1st (D-B) |
| c13 | paid on the 1st | flagged free, end_of_cycle | free starts on the 1st, resets on the 1st |
| c13b | paid on the 20th | flagged free, end_of_cycle | free starts Oct 20 and keeps the 20th (D-D) |
| c20 | paid on the 20th cancelled | flagged default free | starts at cycle end, resets on the following 1st |
| c19 | flag off at attach → config patched on → `updateSubscription` quantity | anchor unchanged, no extra invoice |

**Proration inside a stub (D-C)**
| #  | Scenario | Expect |
|----|----------|--------|
| p1 | sub created Sep 21 anchored Oct 1, $20 → $50 on Sep 25 | charge 50×6/30 = $10, credit from stored row 6.67×6/10 = $4, net $6 (today: $30 − $4) |
| p2 | backdated sub, upgrade mid-cycle | prorated over the full cycle (latent today) |
| p3 | quantity update inside a stub | full-cycle basis |
| p4 | normal sub (created == anchor) | unchanged |
| p5 | long trial (end floor) | unchanged, documented |

**Out of scope:** c14 migration free v1 → v2 keeps the anchor (A9); c16 trials (D4).

## Design

```
setup (attach · multi-attach)
  requestedBillingCycleAnchor = setupRequestedBillingCycleAnchor(...)
    explicit param wins; else a month-start plan starting now asks for the
    next 1st, unless a trial anchors it or the sub is already on a 1st
  billingCycleAnchorMs = setupBillingCycleAnchor(...)
    "now"                → "now"
    number, no sub       → number          (native; wins over backdate)
    number, existing sub → current anchor  (reset is scheduled via resets_at)

setup (create-customer defaults · entity defaults · cancel → default)
  anchor = getMonthStartAnchorMs({ fullProducts, startsAt, trialEndsAt }) ?? "now"

compute
  attach: resets_at only when a sub exists
  line items prorate over the anchor-aligned cycle (D-C)
  finalizeLineItems: "none" also drops the stub before a new sub's anchor

evaluate / execute
  buildStripeNewSubscriptionAnchorParams → billing_cycle_anchor + proration_behavior
  on subscriptions.create and Checkout subscription_data; schedule phases unchanged
```

Files:
- `setup/setupRequestedBillingCycleAnchor.ts` — the request step (new)
- `utils/cycleAnchor/getMonthStartAnchorMs.ts` — pure: products + startsAt → the 1st (new)
- `utils/billingContext/billingContextToNewSubscriptionAnchorMs.ts` — the anchor a new sub is created on (new)
- `providers/stripe/utils/subscriptions/buildStripeNewSubscriptionAnchorParams.ts` (new)
- `external/stripe/.../classifyStripeSubscriptionUtils.ts` — `isStripeSubscriptionAnchoredToMonthStart`
- shared: `getNextMonthStartMs`, `isMonthStartMs`, `isProductAnchoredToMonthStart`, `getEffectivePeriod.startFloor`

## Units (all in the working tree, uncommitted)

1. **Future anchor: native on a new sub, scheduled on an existing one.** Done. 12 green: `billing-cycle-anchor` new-plan 1–4, schedule 1–3, schedule-entities 1–2, new-plan-entities 1–2, scheduled-switch, checkout 1–2.
2. **Flag → implicit request, free and default plans.** Done. 6 green: free 1–3, downgrades 2–3, update-guard.
3. **Flag, paid new subscription.** Done. 7 green: paid 1–4, proration none, transitions 1–2.
4. **Flag, existing subscription.** Done. 6 green: transitions 3–4, anchored-subscription 1–3, downgrades 1 (pins D-D).
5. **Proration basis = the cycle (D-C).** Done. trial-edge-cases 1–2 and immediate-switch-entities-edge-cases 1 green; test helper `getStripeSubscription` no longer copies the floor.

## Open

- Trials on flagged plans (D4): anchor = trial end, flag ignored. No re-anchor at trial end.
- Scheduled switches (D-D): deferred.
- Not run since the final refactor: the full `billing-cycle-anchor` folder and a broad billing sweep. Run once before the PR.
- `augmentBillingContextForAnchorResetRefund` snaps on `billingPeriod.start`; no test covers a `"now"` + `"none"` reset inside a stub period.
- atmn / openapi regen for the new config field: later, not in this branch.
