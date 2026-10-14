import type { Organization } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnStripePriceIndex } from "./autumnStripePriceIndex";

export type ProcessorItemContext = {
	priceIndex: AutumnStripePriceIndex;
	stripePrices: Map<string, Stripe.Price>;
	currency: string;
	org: Organization;
};
