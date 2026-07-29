import type {
	AutumnBillingPlan,
	Entity,
	FullCusProduct,
	FullCustomer,
	FullCustomerLicense,
} from "@autumn/shared";

export type LicenseRelease = {
	entity: Entity;
	assignment: FullCusProduct;
	customerLicense: FullCustomerLicense;
};

export type ReleaseLicenseContext = {
	fullCustomer: FullCustomer;
	entityIds: string[];
	releases: LicenseRelease[];
};

export type ReleaseLicensePlan = {
	billingPlan: AutumnBillingPlan;
};
