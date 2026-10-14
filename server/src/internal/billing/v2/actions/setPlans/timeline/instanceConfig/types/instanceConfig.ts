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

export type LicenseConfig =
	| { type: "granted"; licenses: GrantedLicense[] }
	| { type: "requested"; quantities: CustomerLicenseQuantity[] }
	| { type: "includedOnly" };

export type InstanceConfig = {
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	licenses: LicenseConfig;
	planQuantity: number;
	resetsBillingCycle: boolean;
};
