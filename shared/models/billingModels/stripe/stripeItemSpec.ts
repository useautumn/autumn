import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type Stripe from "stripe";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { FullProduct } from "../../productModels/productModels";

/**
 * Inline Stripe price data for entity-scoped items.
 * Pre-calculated flat amount (not tiered) — Stripe doesn't support tiered price_data.
 * `recurring` is omitted for one-off prices.
 */
export type StripeInlinePrice = {
	product: string;
	currency: string;
	recurring?: Stripe.PriceCreateParams.Recurring;
	unit_amount_decimal: string;
};

/** How a spec renders its price: a stored Stripe price id, or an inline
 * price built from the Autumn config. */
export type StripeItemSpecMode = "stored" | "inline";

/**
 * Intermediate type bridging Autumn price model to Stripe line items.
 * Either `stripePriceId` (stored price) or `stripeInlinePrice` (entity-scoped inline) must be set.
 */
export type StripeItemSpec = {
	stripePriceId?: string;
	stripeInlinePrice?: StripeInlinePrice;
	quantity?: number;
	metadata?: Record<string, string>;
	autumnPrice?: Price;
	autumnEntitlement?: EntitlementWithFeature;
	autumnProduct?: FullProduct;
	autumnCusEnt?: FullCusEntWithFullCusProduct;
};
