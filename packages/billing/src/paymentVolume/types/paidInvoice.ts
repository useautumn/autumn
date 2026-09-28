/** One invoice a live customer paid, as stored: `amount` is major units of `currency`. */
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
