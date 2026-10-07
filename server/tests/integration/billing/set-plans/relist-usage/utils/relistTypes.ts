/** Pro $20 + 100 messages included, $0.10 over. */
export const RELIST = {
	proPrice: 20,
	changedProPrice: 30,
	premiumPrice: 50,
	addOnPrice: 10,
	includedMessages: 100,
	premiumIncludedMessages: 500,
	unitPrice: 0.1,
	changedUnitPrice: 0.15,
	wordsPackPrice: 10,
	wordsPackSize: 100,
	wordsQuantity: 100,
	changedWordsQuantity: 200,
	tracked: 150,
	changeAfterDays: 10,
	customAnchorAfterDays: 20,
} as const;

export type RelistChange =
	| "unchanged"
	| "base_price"
	| "usage_price"
	| "prepaid_quantity"
	| "swap"
	| "drop"
	| "add";
export type RelistAnchor = "unchanged" | "now" | "custom";
export type RelistProration =
	| "prorate_immediately"
	| "none"
	| "bill_difference";

export const RELIST_PRORATIONS: RelistProration[] = [
	"prorate_immediately",
	"none",
	"bill_difference",
];

/** Clock-relative labels so two runs on different clocks compare equal. */
export type RelistDate =
	| "period_start"
	| "change"
	| "custom_anchor"
	| "period_start+1mo"
	| "change+1mo"
	| "custom_anchor+1mo"
	| string;

export type InvoiceSummary = { total: number; messages: number[] };

export type RelistObservation = {
	preview: {
		total: number;
		lines: string[];
		nextCycle: { startsAt: RelistDate; total: number } | null;
	};
	execute: InvoiceSummary[];
	subscription: {
		status: string;
		anchor: RelistDate;
		periodEnd: RelistDate;
		cancelAtPeriodEnd: boolean;
		licensed: string[];
		metered: number;
	} | null;
	balance: { messagesUsage: number; messagesRemaining: number };
	atAnchor: InvoiceSummary[];
	renewal: InvoiceSummary[];
};

/** Totals and usage lines across the timeline: what Stripe ground truth pins. */
export const relistBilling = (observation: RelistObservation) => {
	const sum = (invoices: InvoiceSummary[]) =>
		Math.round(
			invoices.reduce((total, invoice) => total + invoice.total, 0) * 100,
		) / 100;
	return {
		executeTotal: sum(observation.execute),
		executeMessages: observation.execute.flatMap((invoice) => invoice.messages),
		anchorTotal: sum(observation.atAnchor),
		anchorMessages: observation.atAnchor.flatMap((invoice) => invoice.messages),
		renewalTotal: sum(observation.renewal),
		renewalMessages: observation.renewal.flatMap((invoice) => invoice.messages),
		messagesUsage: observation.balance.messagesUsage,
		periodEnd: observation.subscription?.periodEnd ?? null,
		nextCycle: observation.preview.nextCycle,
	};
};

export type RelistBilling = ReturnType<typeof relistBilling>;
