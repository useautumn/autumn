import type { LicenseBillingPriceRow } from "../licenseBillingPriceRow.js";

export type CustomerLicenseBillingContext = {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	assignedSeatCountByCustomerLicenseId: Record<string, number>;
	projectedPlanLicenseIds: string[];
};
