import type { CustomerLicenseTransition, FullCusProduct } from "@autumn/shared";

export type CustomerProductActivation = {
	before: FullCusProduct;
	after: FullCusProduct;
	customerLicenseTransitions: CustomerLicenseTransition[];
};
