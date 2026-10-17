import type { FullCusProduct } from "../../../../models/cusProductModels/cusProductModels";
import type { FullProduct } from "../../../../models/productModels/productModels";
import type { ApprovalCustomerFacts } from "./customerFacts";

/** A trial as billing will create it: measured on the calendar from `starts_at`. */
export type FreeTrialFacts = {
	duration: { length: number; unit: "day" | "month" | "year" };
	/** Unix ms. */
	starts_at: number;
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

/** `null` = the change is at the customer level. */
export type EntityFacts = { feature_id: string } | null;

/** Attach, update, set plans, create schedule. Money is in major units. */
export type BillingChangeFacts = {
	/** The customer before the change. */
	customer: ApprovalCustomerFacts;
	entity: EntityFacts;
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
	billing_cycle_anchor: "now" | "unchanged" | "custom";
	/** Unix ms. */
	starts_at: number | null;
	invoice_mode: { enabled: boolean } | null;
};

/** Cancel. */
export type BillingCancelFacts = {
	customer: ApprovalCustomerFacts;
	entity: EntityFacts;
	cancel_action: "cancel_end_of_cycle" | "cancel_immediately" | null;
	/** The plans being cancelled. */
	outgoing: FullCusProduct[];
	refund: { amount: number } | null;
};

/** Uncancel: only the plans being restored. */
export type BillingUncancelFacts = {
	customer: ApprovalCustomerFacts;
	entity: EntityFacts;
	outgoing: FullCusProduct[];
};
