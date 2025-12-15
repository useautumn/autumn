export type BillingPeriod = {
	start: number;
	end: number;
};

export type LineItemContext = {
	productName: string;
	billingPeriod: BillingPeriod;
	direction: "charge" | "refund";
	now: number;
	billingTiming: "in_arrear" | "in_advance";
};
