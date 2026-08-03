export interface BillingStageParams {
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
	finalizeInvoice?: boolean;
	invoiceTemplateId?: string;
	netTermsDays?: number;
	longLivedCheckout?: boolean;
}
