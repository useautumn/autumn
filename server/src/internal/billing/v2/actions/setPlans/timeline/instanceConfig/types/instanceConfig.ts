import type {
	CustomerLicenseQuantity,
	FeatureOptions,
	FullProduct,
} from "@autumn/shared";

export type GrantedLicense = {
	licensePlanId: string;
	granted: number;
	paidQuantity: number;
};

/**
 * granted: what a saved row holds. requested: totals a request names.
 * includedOnly: a later phase that names none, which grants the included seats.
 */
export type LicenseConfig =
	| { type: "granted"; licenses: GrantedLicense[] }
	| { type: "requested"; quantities: CustomerLicenseQuantity[] }
	| { type: "includedOnly" };

/** Everything that makes two plan instances bill and grant the same. */
export type InstanceConfig = {
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	licenses: LicenseConfig;
	planQuantity: number;
	/** Starting this instance resets the billing cycle anchor. */
	resetsBillingCycle: boolean;
};
