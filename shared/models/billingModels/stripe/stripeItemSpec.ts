import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import type Stripe from "stripe";
import type { Price } from "../../productModels/priceModels/priceModels";
import type { FullProduct } from "../../productModels/productModels";

export type StripeInlinePrice = {
	product: string;
	currency: string;
	recurring?: Stripe.PriceCreateParams.Recurring;
	unit_amount_decimal: string;
};

export type StripeItemSpecMode = "stored" | "inline";

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
