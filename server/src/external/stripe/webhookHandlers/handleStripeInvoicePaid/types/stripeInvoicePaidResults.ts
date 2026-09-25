import type { UpsertCachedInvoiceV2Result } from "@/internal/customers/cache/fullSubject/actions/upsertCachedInvoiceV2.js";

export type StripeInvoicePaidResults = {
	updatedCustomerProductIds: string[];
	appliedBillingPlan: boolean;
	invoiceCache: UpsertCachedInvoiceV2Result | null;
};
