import type { AutumnBillingPlan } from "@autumn/shared";
import type { LicenseQuantityDrift } from "../sync/scope/findLicenseQuantityDrifts.js";

export type SyncLicenseQuantitiesParams = {
	customerId: string;
	licenseQuantityDrifts: LicenseQuantityDrift[];
};

export type SyncLicenseQuantitiesPlan = {
	billingPlan: AutumnBillingPlan;
};
