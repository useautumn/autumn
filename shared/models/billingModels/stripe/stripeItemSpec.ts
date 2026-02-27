import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type Stripe from "stripe";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { FullProduct } from "../../productModels/productModels";

/**
 * Inline Stripe price data for entity-scoped items.
 * Pre-calculated flat amount (not tiered) — Stripe doesn't support tiered price_data.
 */
export type StripeInlinePrice = {
	product: string;
	currency: string;
	recurring: Stripe.PriceCreateParams.Recurring;
	unit_amount_decimal: string;
};

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
