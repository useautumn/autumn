export const BillingFeatureId = {
	Atoms: "atoms",
} as const;

export type BillingFeatureId =
	(typeof BillingFeatureId)[keyof typeof BillingFeatureId];
