import type { LicenseBillingPriceRow } from "../licenseBillingPriceRow.js";

/** License billing state loaded once at setup (the facts that cost a DB
 * read); computes stay pure. Grows a sibling field per future fact.
 * JSON-safe only — deferred billing plans persist this to metadata JSONB. */
export type CustomerLicenseBillingContext = {
	// Assigned seats' snapshot charges as (price × count), the free
	// `included` seats already excluded.
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	assignedSeatCountByCustomerLicenseId: Record<string, number>;
	projectedPlanLicenseIds: string[];
};
