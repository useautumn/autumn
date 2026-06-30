/**
 * The shape the renderer consumes. Decoupled from Autumn's internal models: a
 * data-access module maps Autumn store / ClickHouse rows into this, and the
 * takumi components only ever see this.
 *
 * Every fetch that produces a `CustomerCardData` MUST be scoped to `orgId`.
 */
export type PlanStatus = "active" | "trialing" | "canceled" | "past_due";

/** Plans collapsed by name: "Enterprise ×5" rather than one row per entity. */
export type GroupedPlan = {
	name: string;
	count: number;
	status: PlanStatus;
	priceLabel: string; // preformatted, e.g. "$200,000/yr" or "Free"
};

/** A feature balance rendered as a progress bar. */
export type BalanceBar = {
	feature: string;
	unlimited: boolean;
	/** Fraction of the bar to fill, 0..1 (ignored when unlimited). */
	fraction: number;
	/** Right-aligned label, e.g. "500 / 500" or "Unlimited". */
	label: string;
	/** True when usage exceeded the grant — renders as an over-limit bar. */
	over: boolean;
	/** e.g. "+7,519 over", or null when not in overage. */
	overageLabel: string | null;
};

/** One column of the usage bar chart. */
export type UsagePoint = { label: string; value: number };

export type UsageSeries = {
	featureLabel: string; // e.g. "AI_CREDITS"
	total: number;
	points: UsagePoint[];
};

/** One invoice, with its real status — never collapsed to a single bucket. */
export type InvoiceLine = {
	/** Product names this invoice is for, e.g. "Enterprise, Add On Pro". */
	products: string;
	/** draft | open | void | paid | uncollectible | null — verbatim from source. */
	status: string | null;
	totalLabel: string; // currency-formatted, e.g. "$200,000.00"
	createdAt: string; // ISO
};

export type CustomerCardData = {
	orgId: string;
	customerId: string;
	name: string;
	email: string | null;
	createdAt: string; // ISO

	entityCount: number;
	plans: GroupedPlan[];
	balances: BalanceBar[];
	featureFlags: string[];
	usage: UsageSeries | null;

	invoices: InvoiceLine[];
};
