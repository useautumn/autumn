import type { Entitlement, Price } from "@autumn/shared";

export type AutumnStripePrice = {
	planId: string;
	planName: string;
	featureId: string | null;
	featureName: string | null;
	price: Price;
	entitlement?: Entitlement;
};

export type AutumnStripePriceIndex = {
	byAutumnPriceId: Map<string, AutumnStripePrice>;
	byStripePriceId: Map<string, AutumnStripePrice>;
};
