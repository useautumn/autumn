import type { ProductItem } from "@autumn/shared";

export type SyncMatchMethod =
	| "stripe_price_id"
	| "stripe_product_id"
	| "product_processor";

export type SyncProposalStripeTier = {
	up_to: number | null;
	unit_amount: number | null;
	flat_amount: number | null;
};

export type SyncProposalItem = {
	stripe_price_id: string;
	stripe_product_id: string | null;
	stripe_product_name: string | null;
	quantity: number | null;

	unit_amount: number | null;
	currency: string | null;
	billing_scheme: "per_unit" | "tiered" | null;
	tiers_mode: "graduated" | "volume" | null;
	recurring_usage_type: "licensed" | "metered" | null;
	tiers: SyncProposalStripeTier[] | null;

	matched_plan_id: string | null;
	matched_plan_name: string | null;
	matched_price_id: string | null;
	match_method: SyncMatchMethod | null;
};

export type SyncProposal = {
	stripe_subscription_id: string;
	stripe_subscription_status: string;
	current_period_end: number;
	trial_end: number | null;
	cancel_at: number | null;
	canceled_at: number | null;
	already_linked_product_id: string | null;
	items: SyncProposalItem[];
};

export type SyncProposalsResponse = {
	proposals: SyncProposal[];
};

/** A confirmed mapping ready to send to billing.sync */
export type SyncMapping = {
	stripe_subscription_id: string;
	plan_id: string;
	expire_previous: boolean;
	enabled: boolean;
	items: ProductItem[] | null;
};
