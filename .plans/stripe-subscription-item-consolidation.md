# Plan: Stripe Subscription Item Consolidation

## Goal

Reduce noisy duplicate Stripe subscription items when Autumn attaches multiple customer products with identical billing semantics.

Today, multi-attach prepaid add-ons can create one Stripe price and one Stripe subscription item per customer product. In Stripe this looks like four separate lines even when the customer really bought two identical monthly packs and two identical annual packs:

- prepaid credits `$10 / month`
- prepaid credits `$10 / month`
- prepaid workflows `$10 / year`
- prepaid workflows `$10 / year`

The target shape is fewer Stripe subscription items with quantities or shared price resources, while Autumn still tracks each customer product, customer price, entitlement, cancellation, and renewal independently.

## Current Problem

Autumn often treats each attached customer product as its own concrete billing object. That is useful internally, but it leaks into Stripe:

- duplicate prepaid add-ons produce separate Stripe subscription items
- customized or customer-specific prices produce separate Stripe price IDs even when the price shape is identical
- schedules become harder to reason about because future phases contain repeated inline prices
- Stripe dashboard pricing tables become noisy and hard to audit

This also interacts with schedule updates. If each duplicate has its own subscription item, cancellation or phase replacement must preserve item identity carefully to avoid Stripe resetting item periods or creating unexpected prorations.

## Proposed Model

Introduce a Stripe-side aggregation layer between Autumn customer prices and Stripe subscription item specs.

Autumn should still create and store one `customer_product` and one or more `customer_prices` per attached product. Stripe does not need to receive one subscription item for every `customer_price` when multiple prices are billing-equivalent.

Group billable specs by a strict `StripeSubscriptionItemAggregationKey`:

- Stripe product identity
- currency
- recurring interval and interval count
- unit amount decimal or tier shape
- billing scheme, tiers mode, transform quantity, usage type
- tax behavior and tax code if present
- discount eligibility or attached discounts
- collection behavior relevant to invoice calculation
- any metadata that must appear on the Stripe line item

For each group:

- create one Stripe subscription item
- set quantity to the total billable quantity for the group
- persist an Autumn allocation map that records which customer prices are represented by that Stripe item

## Allocation Map

Collapsing requires an explicit mapping because Stripe item metadata cannot safely represent many customer prices forever.

Candidate storage options:

- add a table mapping `stripe_subscription_item_id -> customer_price_id`
- extend an existing customer price billing reference table if one exists
- store only current mappings in Autumn DB, not in Stripe metadata

The map should support:

- cancel one attached copy by decrementing Stripe quantity
- cancel all attached copies by deleting the Stripe item
- distinguish two customer products that share the same underlying `autumn_price_id`
- rebuild the mapping during sync or migration
- explain an invoice line item back to all represented customer prices

Stripe metadata can keep summary fields for debugging, but should not be the source of truth for many-to-one identity.

## Zero-Dollar Items

Do not create Stripe subscription items for `$0` recurring prices when another subscription item with the same billing interval can safely carry the period.

This should be conservative:

- omit only if the zero-dollar item has no Stripe-visible invoice effect
- omit only if Autumn can derive its period from another same-interval item
- keep the item if it is the only Stripe object establishing that interval
- keep the item if Stripe item identity is needed for schedule transitions, tax, discounts, trials, or external reporting

Zero-dollar omission should be a separate branch from paid-item consolidation. It is related, but riskier because the Stripe item disappears entirely.

## Non-Goals

Do not collapse items that merely look similar in the dashboard. They must be identical for Stripe invoice math.

Do not collapse across different intervals, currencies, Stripe products, tax behavior, discount behavior, or tier shapes.

Do not use `autumn_price_id` alone as the aggregation key. Two customer products can share the same Autumn price but still require separate Autumn lifecycle tracking.

Do not rely on a JSON blob in Stripe metadata as the durable allocation source. Metadata limits and sync behavior make that brittle.

## Implementation Shape

Add a dedicated aggregation step before converting Autumn billing specs into Stripe subscription items.

Likely areas:

- `server/src/internal/billing/v2/providers/stripe/utils/subscriptionItems/`
- `server/src/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/`
- `server/src/internal/billing/v2/providers/stripe/utils/matchUtils/`

Candidate helpers:

```ts
buildStripeSubscriptionItemAggregationKey(spec)
collapseStripeItemSpecs(specs)
expandStripeInvoiceLineAllocations(lineItem)
```

The aggregation key should reuse the same price-shape comparison utilities we use for inline price matching. If the shape comparison says two inline prices are not identical, aggregation must not collapse them.

## Migration Strategy

Start with new subscriptions only.

For existing subscriptions:

1. Detect groups of active Stripe subscription items that are aggregation-equivalent.
2. Preview the Stripe update that would replace them with one item and a higher quantity.
3. Apply only if the preview has no invoice impact.
4. Persist the allocation map.
5. Leave ambiguous subscriptions untouched.

No migration should merge items if it would create prorations, change periods, or lose invoice-line attribution.

## Schedule Behavior

Schedule phases should collapse independently. A Stripe item can represent many Autumn customer prices within the same phase, but future phases must not accidentally reuse the same allocation map if membership changes.

Examples:

- Phase 1 has two identical monthly prepaid credit packs: one Stripe item, quantity `2`.
- Phase 2 cancels one pack: same Stripe item, quantity `1`.
- Phase 3 adds another identical pack: same billing key, quantity `2`, allocation map updated for that phase.

For inline prices, reuse the existing Stripe subscription item only when the collapsed group still matches the current item shape and period semantics.

## Test Matrix

Add tests before implementing:

- two identical monthly prepaid add-ons collapse to one Stripe item with quantity `2`
- two identical annual prepaid add-ons collapse to one Stripe item with quantity `2`
- cancel one of two identical monthly add-ons decrements quantity and invoices one renewal
- cancel one of two identical annual add-ons decrements quantity without charging annual renewal
- monthly and annual identical-looking add-ons do not collapse together
- same interval but different amount does not collapse
- same amount but different feature or Stripe product does not collapse unless explicitly allowed by product identity
- customized inline prices collapse only when exact Stripe price shape matches
- entity-scoped add-ons preserve allocation and entitlement ownership
- invoice line item matching can explain a collapsed Stripe line back to all represented customer prices
- checkout sessions either use the same aggregation rule or explicitly opt out
- subscription schedules preserve correct quantities across phase changes
- zero-dollar recurring item is omitted only when a same-interval carrier item exists
- zero-dollar-only interval keeps a Stripe item or an explicit Autumn period source

## Acceptance Criteria

- Stripe dashboard shows one line per billing-equivalent group, not one line per Autumn customer product.
- Autumn can still cancel, renew, migrate, and explain each customer product independently.
- Invoice totals are unchanged compared with the uncollapsed representation.
- Schedule phase transitions do not create extra prorations from aggregation changes alone.
- Sync and restore can rebuild or validate the allocation map.
- Existing multi-attach, checkout, invoice-line-item, schedule, and migration test groups pass.

## Risks

The main risk is losing one-to-one identity. Stripe has one subscription item, but Autumn may have many customer prices behind it. Every path that currently assumes `customer_price -> stripe_subscription_item` is one-to-one must be audited.

Changing quantity can have different Stripe proration behavior than deleting one item and keeping another. This must be covered with invoice previews and test clocks.

Zero-dollar omission can break period derivation if Autumn currently depends on a Stripe subscription item to know renewal timing. That needs a clear replacement source before removing those items.

This is a cleanup and correctness project, not just a dashboard polish. The implementation should be gated behind tests and probably a feature flag.
