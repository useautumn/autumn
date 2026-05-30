# Plan: Stripe Schedule Phase Boundary Invoicing

## Goal

Evaluate and implement `proration_behavior: "always_invoice"` for Stripe subscription schedule phase transitions that start on a true billing cycle boundary.

The intended outcome is to invoice the customer once for the complete phase transition when the transition already coincides with a renewal event, while preserving Stripe's default deferred-proration behavior for off-cycle transitions.

## Current Behavior

Stripe schedule phases have two different proration controls:

- Top-level schedule update `proration_behavior` applies when we edit the current phase.
- Per-phase `proration_behavior` applies when Stripe enters that future phase.

Stripe's default for a phase transition is `create_prorations`. That creates proration invoice items, but does not always invoice them immediately.

In the mixed-interval case we tested:

- Phase 1: annual prepaid item customized to `$120` + monthly prepaid item at `$10`.
- Phase 2 starts one month later: monthly prepaid removed, annual prepaid customized to `$240`.
- At the transition timestamp, Stripe renews the monthly item on an invoice, then applies the phase change.
- Stripe leaves the annual delta and removed monthly credit as pending invoice items:
  - annual old-price credit for unused time
  - annual new-price charge for remaining time
  - monthly removed-item credit

Economically this is correct, but operationally confusing: the transition is split across an actual invoice and pending invoice items.

## Why Boundary-Only `always_invoice`

Using `always_invoice` at a true billing cycle boundary should make the invoice match the billing event:

- The customer is already being invoiced at that timestamp.
- The schedule transition is also taking effect at that timestamp.
- The invoice should show the net result of the transition instead of charging one renewed item now and leaving related adjustments pending.

This is especially useful for mixed monthly/annual schedules:

- Monthly renewal line: charged on the boundary.
- Removed monthly line: credited by the phase transition.
- Annual replacement: credited for unused old annual time and charged for remaining new annual time.

With default `create_prorations`, those can be split between a finalized invoice and pending items. With boundary-only `always_invoice`, the target behavior is one coherent invoice for the transition.

## Non-Goals

Do not set `always_invoice` globally.

Do not use Autumn-derived anchors such as `customerProduct.starts_at + interval`. That is too easy to get wrong for imported subscriptions, anchor resets, mixed intervals, schedule edits, trials, and Stripe-side changes.

Do not use legacy interval helpers for boundary detection. If interval arithmetic is needed, use the newer billing interval utilities and validate against actual Stripe subscription state.

Do not change off-cycle schedule behavior without a separate product decision. Off-cycle changes can reasonably create pending prorations instead of immediately charging the customer.

## Proposed Rule

For each future phase in a Stripe subscription schedule update:

1. Determine whether the phase start is a true Stripe billing boundary for the subscription being transitioned.
2. If yes, set that phase's `proration_behavior` to `"always_invoice"`.
3. If no, leave `proration_behavior` unset and keep Stripe's default `create_prorations`.

Boundary detection should be based on Stripe state, not Autumn product state:

- `stripeSubscription.billing_cycle_anchor`
- current period boundaries on the Stripe subscription and items, if available in the API shape we use
- the schedule's current and future phase timestamps
- invoice preview or test-clock experiments for ambiguous mixed-interval cases

If Stripe does not expose enough reliable state to make this deterministic, prefer no behavior change over a heuristic.

## Implementation Shape

Add a small Stripe-provider utility for the boundary decision. Keep it close to schedule execution code because this is Stripe policy, not a shared Autumn domain utility.

Candidate location:

`server/src/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/`

Candidate helper:

```ts
shouldAlwaysInvoiceSchedulePhaseTransition({
  stripeSubscription,
  phaseStart,
  currentPhase,
  nextPhase,
})
```

Call it from the schedule action path that serializes Stripe phases, most likely near:

`server/src/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction.ts`

The caller should have a short JSDoc explaining the invariant: only force immediate invoicing when Stripe is already at a renewal boundary, so related proration lines do not get stranded as pending invoice items.

## Investigation Steps

1. Re-read Stripe's current subscription schedule docs for phase transition proration behavior.
2. Confirm via test clocks whether `always_invoice` at a phase boundary creates one invoice with the expected transition net.
3. Confirm whether `always_invoice` sweeps unrelated pre-existing pending invoice items into the same invoice.
4. Confirm how payment failure and dunning behave when a boundary transition invoice is forced.
5. Confirm behavior for Stripe classic billing mode and flexible billing mode if both are supported.
6. Only then wire the helper into schedule phase serialization.

## Test Matrix

Add tests before changing behavior:

- Monthly boundary, annual prepaid customized `$120 -> $240`, monthly prepaid removed.
- Monthly boundary, annual base customized `$120 -> $240`, monthly add-on removed.
- Off-boundary annual prepaid replacement still uses pending prorations.
- Off-boundary annual base replacement still uses pending prorations.
- Duplicate inline prepaid add-ons do not collapse into one Stripe subscription item.
- Entity-scoped prepaid add-ons preserve one-to-one subscription item identity within a phase.
- Existing pending invoice items are either intentionally swept or explicitly avoided.
- Checkout session creation still produces expected line items.
- Invoice line item matching from Stripe subscription items back to Autumn customer prices still works.
- Anchor reset flows keep their existing invoice count and totals unless intentionally changed.

## Acceptance Criteria

- Boundary transitions produce no stray pending invoice items for the changed schedule items.
- Invoice totals equal the net of unused old-period credit plus remaining new-period charge.
- Removed monthly items net out correctly when the transition happens at the monthly renewal boundary.
- Off-boundary transitions retain current `create_prorations` behavior.
- Existing schedule, checkout, attach, multi-attach, and invoice-line-item integration groups pass.

## Risks

`always_invoice` changes collection timing. That can affect payment failures, dunning, invoice counts, webhook order, and customer-visible invoices.

Mixed-interval schedules are the highest-risk area because a phase can start on the monthly boundary while annual items are mid-cycle. That is the exact case where `always_invoice` may be useful, but it is also where boundary detection must be precise.

Stripe may include unrelated pending invoice items when forcing an invoice. This must be tested before enabling the behavior.

If boundary detection is uncertain, keep Stripe's default behavior. A confusing pending item is better than an incorrect immediate charge.
