import type {
	AttachLicenseEntityParams,
	AutumnBillingPlan,
	DbCustomerProduct,
	Entity,
	FullCusProduct,
	FullCustomer,
	FullCustomerLicense,
	FullPlanLicense,
} from "@autumn/shared";

export type AttachLicenseContext = {
	fullCustomer: FullCustomer;
	parentCustomerProduct: FullCusProduct;
	customerLicense: FullCustomerLicense & { planLicense: FullPlanLicense };
	currentEpochMs: number;
	resetCycleAnchorMs: number | "now";
	entityParams: AttachLicenseEntityParams[];
	existingEntities: Entity[];
	newEntityParams: AttachLicenseEntityParams[];
	unusedAssignments: DbCustomerProduct[];
};

export type AttachLicensePlan = {
	available: number;
	assignments: { entity: Entity; customerProduct: FullCusProduct }[];
	billingPlan: AutumnBillingPlan;
};
