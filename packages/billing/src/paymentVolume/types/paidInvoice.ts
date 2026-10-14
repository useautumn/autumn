export type PaidInvoice = {
	id: string;
	stripeId: string;
	processorType: string | null;
	orgId: string;
	orgSlug: string;
	currency: string;
	amount: number;
	paidAtMs: number;
};
