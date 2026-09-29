import type Stripe from "stripe";
import type { AutumnStripePriceIndex } from "./autumnStripePriceIndex";

/** Everything needed to describe a Stripe item: who owns it and how it bills. */
export type ProcessorItemContext = {
	priceIndex: AutumnStripePriceIndex;
	stripePrices: Map<string, Stripe.Price>;
	currency: string;
};
