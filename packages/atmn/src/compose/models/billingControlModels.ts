export type AutoTopupPurchaseLimit = {
	interval: "hour" | "day" | "week" | "month";
	intervalCount?: number;
	limit: number;
};

export type AutoTopup = {
	featureId: string;
	enabled?: boolean;
	threshold: number;
	quantity: number;
	purchaseLimit?: AutoTopupPurchaseLimit;
	invoiceMode?: boolean;
};

export type SpendLimit = {
	featureId?: string;
	enabled?: boolean;
	limitType?: "absolute" | "usage_percentage";
	overageLimit?: number;
};

export type UsageLimit = {
	featureId: string;
	enabled?: boolean;
	limit: number;
	interval: "day" | "week" | "month" | "year";
};

export type UsageAlert = {
	featureId?: string;
	enabled?: boolean;
	threshold: number;
	thresholdType:
		| "usage"
		| "usage_percentage"
		| "remaining"
		| "remaining_percentage";
	name?: string;
};

export type OverageAllowed = {
	featureId: string;
	enabled?: boolean;
};

/** Plan-level billing controls used as customer defaults. */
export type BillingControls = {
	autoTopups?: AutoTopup[];
	spendLimits?: SpendLimit[];
	usageLimits?: UsageLimit[];
	usageAlerts?: UsageAlert[];
	overageAllowed?: OverageAllowed[];
};
