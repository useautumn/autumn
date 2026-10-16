import type { FullCustomer } from "../../../../models/cusModels/fullCusModel";
import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels";
import type { FullProduct } from "../../../../models/productModels/productModels";

export type FreeTrialFacts = {
	duration_length: number;
	duration_type: "day" | "month" | "year";
	card_required: boolean;
	on_end: "bill" | "revert";
};

/** One plan the request adds, as the customer would get it (customizations applied). */
export type IncomingPlanFacts = {
	product: FullProduct;
	free_trial: FreeTrialFacts | null;
	feature_quantities: { feature_id: string; quantity: number }[];
	customized: boolean;
};

/** Attach, update subscription, set plans, schedule. Money is in major units. */
export type BillingChangeFacts = {
	/** The customer before the change. */
	customer: FullCustomer;
	incoming: IncomingPlanFacts[];
	outgoing: FullCusProduct[];
	paid: boolean;
	checkout: boolean;
	total: number;
	next_cycle: { total: number } | null;
	discounts: {
		reward_id: string;
		percent_off: number | null;
		amount_off: number | null;
	}[];
	plan_schedule: "immediate" | "end_of_cycle" | null;
	proration_behavior: "prorate_immediately" | "none" | "bill_difference" | null;
	/** Unix ms. */
	starts_at: number | null;
	invoice_mode: { enabled: boolean } | null;
};

/** Cancel, uncancel. */
export type BillingCancelFacts = {
	customer: FullCustomer;
	cancel_action: "cancel_end_of_cycle" | "cancel_immediately" | null;
	/** The plans being cancelled. */
	outgoing: FullCusProduct[];
	refund: { amount: number } | null;
};
