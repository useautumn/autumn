# Stripe Sync Matching Draft

## Status
The broader `customer.subscription.created` auto-sync feature is paused. This draft preserves the current research so we can resume later, while the immediate focus shifts to consolidating Stripe -> Autumn matching utilities.

## Current Direction
We should build the new canonical utilities first and defer migration of existing callers until a later, safer phase. The first implementation pass should therefore be additive only:
- create the new utility home under [server/src/internal/billing/v2/providers/stripe/utils/sync](server/src/internal/billing/v2/providers/stripe/utils/sync)
- define canonical matcher types, priority semantics, and normalized Stripe input shapes
- add Stripe-keyed lookup builders that support the full identifier set
- leave existing sync, invoice, checkout, and legacy helpers untouched for now

## Paused Auto-Sync Draft
- Event in scope: `customer.subscription.created`
- Intended skip guard: subscription metadata only, using an Autumn-owned marker such as `autumn_event`
- Same-group behavior: if an external Stripe subscription matches a product in a group with an existing active Autumn product, expire the old product and insert the new one
- Future implementation should follow the newer webhook handler pattern used by [server/src/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/handleStripeSubscriptionUpdated.ts](server/src/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/handleStripeSubscriptionUpdated.ts) instead of the current stub at [server/src/external/stripe/webhookHandlers/handleSubCreated.ts](server/src/external/stripe/webhookHandlers/handleSubCreated.ts)

## Why This Needs Cleanup First
Stripe -> Autumn matching is currently split across sync actions, invoice-line persistence, legacy subscription helpers, checkout helpers, log helpers, and service lookups. The same Stripe identifiers are interpreted differently depending on the path:
- `stripe_price_id`
- `stripe_empty_price_id`
- `stripe_prepaid_price_v2_id`
- `stripe_product_id`
- `product.processor.id`
- metadata like `autumn_line_item_id` and `autumn_customer_price_id`

That makes the auto-sync feature too risky to build first.

## Main Matching Surfaces

### 1. Sync Proposal Matching
- [server/src/internal/billing/v2/actions/sync/utils/matchSubscriptionItemToAutumn.ts](server/src/internal/billing/v2/actions/sync/utils/matchSubscriptionItemToAutumn.ts)
- [server/src/internal/billing/v2/actions/sync/utils/matchStripeSubscriptionsToProducts.ts](server/src/internal/billing/v2/actions/sync/utils/matchStripeSubscriptionsToProducts.ts)
- [server/src/internal/products/prices/PriceService.ts](server/src/internal/products/prices/PriceService.ts)
- [server/src/internal/products/ProductService.ts](server/src/internal/products/ProductService.ts)

Current behavior:
- sync proposals batch-load Autumn prices/products from Stripe ids
- matching priority is effectively `stripe_price_id` -> price-level `stripe_product_id` -> product-level `processor.id`
- the sync path currently depends on lookup maps more than canonical matching helpers

Current gap:
- `PriceService.getByStripeId` and `PriceService.getByStripeIds` support `stripe_price_id` and `stripe_empty_price_id`, but not `stripe_prepaid_price_v2_id`

### 2. Invoice Line Matching
- [shared/utils/billingUtils/invoicingUtils/lineItemUtils/billingLineItemMatchesStripeLineItem.ts](shared/utils/billingUtils/invoicingUtils/lineItemUtils/billingLineItemMatchesStripeLineItem.ts)
- [shared/utils/billingUtils/invoicingUtils/lineItemUtils/filterBillingLineItemsByStripeLineItem.ts](shared/utils/billingUtils/invoicingUtils/lineItemUtils/filterBillingLineItemsByStripeLineItem.ts)
- [shared/utils/billingUtils/invoicingUtils/lineItemUtils/findBillingLineItemByStripeLineItem.ts](shared/utils/billingUtils/invoicingUtils/lineItemUtils/findBillingLineItemByStripeLineItem.ts)
- [server/src/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/stripeLineItemGroupToDbLineItems.ts](server/src/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/stripeLineItemGroupToDbLineItems.ts)
- [server/src/internal/billing/v2/workflows/storeInvoiceLineItems/fetchSubscriptionItemsMetadata.ts](server/src/internal/billing/v2/workflows/storeInvoiceLineItems/fetchSubscriptionItemsMetadata.ts)

Current behavior:
- invoice matching is metadata-first
- then it matches by Stripe price id
- then it matches by product processor id or `price.config.stripe_product_id`

Current gaps:
- invoice matching supports `stripe_prepaid_price_v2_id`
- invoice matching does not consistently include `stripe_empty_price_id`
- `findBillingLineItemByStripeLineItem` does not accept subscription item metadata, while `filterBillingLineItemsByStripeLineItem` does

### 3. Legacy Subscription and Schedule Matching
- [server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts](server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts)
- [server/src/internal/customers/attach/mergeUtils/paramsToSubItems.ts](server/src/internal/customers/attach/mergeUtils/paramsToSubItems.ts)
- [server/src/internal/customers/attach/mergeUtils/paramsToScheduleItems.ts](server/src/internal/customers/attach/mergeUtils/paramsToScheduleItems.ts)
- [server/src/external/stripe/subscriptions/subscriptionItems/utils/findSubscriptionItemByAutumnPrice.ts](server/src/external/stripe/subscriptions/subscriptionItems/utils/findSubscriptionItemByAutumnPrice.ts)
- [server/src/external/stripe/checkoutSessions/utils/findCheckoutLineItem.ts](server/src/external/stripe/checkoutSessions/utils/findCheckoutLineItem.ts)

Current behavior:
- this area contains several older or narrower matchers
- some include `stripe_empty_price_id`
- some include `stripe_prepaid_price_v2_id`
- some only compare `stripe_price_id`
- some are marked deprecated but are still used

### 4. Logging and Lookup Helpers
- [server/src/internal/billing/v2/utils/billingContextPriceLookup.ts](server/src/internal/billing/v2/utils/billingContextPriceLookup.ts)
- [server/src/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils.ts](server/src/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils.ts)

Current behavior:
- these helpers are lightweight and mostly in-memory
- they encode still more matching logic for log formatting and phase debugging

## Duplications and Inconsistencies
- Sync proposal matching and invoice matching use different priority ladders.
- Runtime matchers explicitly mention `stripe_prepaid_price_v2_id`, but service-backed sync lookup does not.
- Checkout and subscription-item helpers include `stripe_empty_price_id` more consistently than invoice helpers.
- Product-level fallback sometimes means `product.processor.id`, sometimes `price.config.stripe_product_id`, and sometimes either.
- Metadata-first matching is available for invoice lines and checkout lines, but not in the sync matcher.
- Deprecated legacy helpers in [server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts](server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts) still power live flows.

## Proposed Destination
Move Stripe -> Autumn sync and matching utilities into:

- [server/src/internal/billing/v2/providers/stripe/utils/sync](server/src/internal/billing/v2/providers/stripe/utils/sync)

This should become the canonical home for inbound Stripe correlation logic.

## Proposed Structure

### `identity/`
Pure matching predicates with no DB calls.

Suggested responsibilities:
- compare a Stripe price id against an Autumn price
- compare a Stripe product id against an Autumn price/product
- compare a Stripe subscription item against an Autumn price/product candidate
- compare a Stripe invoice line against an Autumn line item candidate
- expose one explicit match priority model instead of several incompatible enums

Likely future residents:
- extracted logic from `matchSubscriptionItemToAutumn`
- extracted logic from `billingLineItemMatchesStripeLineItem`
- extracted logic from `findSubscriptionItemByAutumnPrice`
- extracted logic from `findCheckoutLineItemByAutumnPrice`
- extracted logic from `autumnStripePricesMatch`

### `indexes/`
Server-side loaders and Stripe-keyed indexes that prepare lookup maps.

Suggested responsibilities:
- build `priceByStripePriceId`
- build `priceByStripeProductId`
- build `productByStripeProductId`
- centralize support for `stripe_prepaid_price_v2_id`
- keep org and env scoping explicit where required

Likely future residents:
- sync-oriented indexing now split across `PriceService`, `ProductService`, and `matchStripeSubscriptionsToProducts`

### `adapters/`
Convert Stripe objects into normalized sync inputs before matching.

Suggested responsibilities:
- normalize Stripe subscription items
- normalize Stripe invoice lines plus optional subscription item metadata
- normalize checkout line items
- normalize schedule phase items

This keeps matcher code independent from raw Stripe API shape differences.

### `orchestrators/`
Higher-level workflows that use normalized inputs plus indexes.

Suggested responsibilities:
- build sync proposals from Stripe subscriptions
- match grouped invoice lines to Autumn billing line items
- find Stripe line items or subscription items for a given Autumn object in write paths

Likely future residents:
- the current proposal builder
- invoice line conversion helpers
- selected operational helpers now scattered under `external/stripe`

## Migration Principles
- Keep `providers/stripe/utils/sync` as the source of truth for Stripe -> Autumn matching.
- Let shared code own only the pieces that are truly server-agnostic and safe to reuse without DB access.
- Do not move orchestration-heavy code into shared if it depends on Stripe SDK types plus server services.
- Migrate callers gradually by first extracting pure matchers, then updating existing sites to delegate to them.
- Remove or deprecate legacy helpers only after all live callers are off them.

## Recommended First Pass
1. Define one canonical identifier vocabulary and one matching priority model.
2. Build a new sync lookup layer that supports `stripe_prepaid_price_v2_id` in addition to the current ids.
3. Extract pure predicates from the current sync matcher and invoice matcher into the new `identity` area.
4. Add normalized adapters for subscription items, invoice lines, checkout line items, and schedule items.
5. Document how current helpers will migrate later, but do not change live callers yet.
6. Revisit migration only after the new utility surface is stable and reviewed.

## Files To Revisit During Implementation
- [server/src/internal/billing/v2/actions/sync/utils/matchSubscriptionItemToAutumn.ts](server/src/internal/billing/v2/actions/sync/utils/matchSubscriptionItemToAutumn.ts)
- [server/src/internal/billing/v2/actions/sync/utils/matchStripeSubscriptionsToProducts.ts](server/src/internal/billing/v2/actions/sync/utils/matchStripeSubscriptionsToProducts.ts)
- [server/src/internal/products/prices/PriceService.ts](server/src/internal/products/prices/PriceService.ts)
- [shared/utils/billingUtils/invoicingUtils/lineItemUtils/billingLineItemMatchesStripeLineItem.ts](shared/utils/billingUtils/invoicingUtils/lineItemUtils/billingLineItemMatchesStripeLineItem.ts)
- [server/src/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/stripeLineItemGroupToDbLineItems.ts](server/src/internal/billing/v2/providers/stripe/utils/invoiceLines/convertToDbLineItem/stripeLineItemGroupToDbLineItems.ts)
- [server/src/external/stripe/subscriptions/subscriptionItems/utils/findSubscriptionItemByAutumnPrice.ts](server/src/external/stripe/subscriptions/subscriptionItems/utils/findSubscriptionItemByAutumnPrice.ts)
- [server/src/external/stripe/checkoutSessions/utils/findCheckoutLineItem.ts](server/src/external/stripe/checkoutSessions/utils/findCheckoutLineItem.ts)
- [server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts](server/src/external/stripe/stripeSubUtils/stripeSubItemUtils.ts)
- [server/src/internal/billing/v2/utils/billingContextPriceLookup.ts](server/src/internal/billing/v2/utils/billingContextPriceLookup.ts)

## Dedicated Utility Organization Plan
The next implementation plan should focus only on:
- creating the new `providers/stripe/utils/sync` structure
- defining canonical matcher APIs
- building additive utilities first without caller rewiring
- deciding what stays in `shared` versus what lives server-side
- documenting which legacy helpers become compatibility wrappers versus which are deleted later
