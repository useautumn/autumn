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
	// Matched by the effective link's public product id, so planLicense is set.
	customerLicense: FullCustomerLicense & { planLicense: FullPlanLicense };
	currentEpochMs: number;
	resetCycleAnchorMs: number | "now";
	// The requested entities, split against the customer's existing ones —
	// unmatched ones are created by the plan.
	entityParams: AttachLicenseEntityParams[];
	existingEntities: Entity[];
	newEntityParams: AttachLicenseEntityParams[];
	// Released seats waiting in the pool, re-pointed before any new seat is
	// provisioned. Fetched bounded by the request size.
	unusedAssignments: DbCustomerProduct[];
};

export type AttachLicensePlan = {
	available: number;
	assignments: { entity: Entity; customerProduct: FullCusProduct }[];
	billingPlan: AutumnBillingPlan;
};
