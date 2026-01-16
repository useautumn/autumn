import type { Price } from "../../productModels/priceModels/priceModels";

export type StripeItemSpec = {
	stripePriceId: string; // stripe price ID
	quantity?: number;
	autumnPrice?: Price;
};
