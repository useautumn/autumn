/** Features on Autumn's own billing that gate parts of the product (see config/features.ts). */
export const BillingFeatureId = {
	Atoms: "atoms",
} as const;

export type BillingFeatureId =
	(typeof BillingFeatureId)[keyof typeof BillingFeatureId];
