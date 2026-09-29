import type { Price } from "@autumn/shared";

export type AutumnStripePrice = {
	planId: string;
	planName: string;
	featureId: string | null;
	featureName: string | null;
	price: Price;
};

export type AutumnStripePriceIndex = {
	byAutumnPriceId: Map<string, AutumnStripePrice>;
	byStripePriceId: Map<string, AutumnStripePrice>;
};
