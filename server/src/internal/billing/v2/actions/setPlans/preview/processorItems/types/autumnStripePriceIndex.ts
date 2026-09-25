export type AutumnStripePrice = {
	planId: string;
	featureId: string | null;
	displayName: string;
};

export type AutumnStripePriceIndex = {
	byAutumnPriceId: Map<string, AutumnStripePrice>;
	byStripePriceId: Map<string, AutumnStripePrice>;
};
