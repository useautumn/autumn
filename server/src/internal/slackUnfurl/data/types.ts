export type PlanStatus = "active" | "trialing" | "canceled" | "past_due";

export type GroupedPlan = {
	name: string;
	count: number;
	status: PlanStatus;
	priceLabel: string;
};

export type BalanceBar = {
	feature: string;
	unlimited: boolean;
	fraction: number;
	label: string;
	over: boolean;
	overageLabel: string | null;
};

export type UsagePoint = { label: string; value: number };

export type UsageSeries = {
	featureLabel: string;
	total: number;
	points: UsagePoint[];
};

export type InvoiceLine = {
	products: string;
	status: string | null;
	totalLabel: string;
	createdAt: string;
};

export type CustomerCardData = {
	orgId: string;
	customerId: string;
	name: string;
	email: string | null;
	createdAt: string;

	entityCount: number;
	plans: GroupedPlan[];
	balances: BalanceBar[];
	featureFlags: string[];
	usage: UsageSeries | null;

	invoices: InvoiceLine[];
};
