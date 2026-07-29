import type { LicenseBillingPriceRow } from "../licenseBillingPriceRow.js";

/** License billing state loaded once; JSON-safe because deferred plans persist
 * this context to metadata JSONB. */
export type CustomerLicenseBillingContext = {
	// Assigned seats' snapshot charges as (price × count), the free
	// `included` seats already excluded.
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	assignedSeatCountByCustomerLicenseId: Record<string, number>;
	projectedPlanLicenseIds: string[];
};
