import type { InvoicePaymentMethod } from "@autumn/shared";

export interface BillingStageParams {
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
	finalizeInvoice?: boolean;
	invoiceTemplateId?: string;
	netTermsDays?: number;
	paymentMethodTypes?: InvoicePaymentMethod[];
	longLivedCheckout?: boolean;
}
