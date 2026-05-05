import type Stripe from "stripe";

export type StripeItemTier = {
	up_to: number | null;
	unit_amount: number | null;
	flat_amount: number | null;
};

export type StripeItemSnapshot = {
	id: string;
	stripe_price_id: string;
	stripe_product_id: string;
	unit_amount: number | null;
	currency: string | null;
	quantity: number;
	billing_scheme: "per_unit" | "tiered" | null;
	tiers_mode: "graduated" | "volume" | null;
	tiers: StripeItemTier[] | null;
	recurring_interval: Stripe.Price.Recurring.Interval | null;
	recurring_usage_type: "licensed" | "metered" | null;
	metadata: Stripe.Metadata;
};

export type PhaseSnapshot = {
	start_date: number;
	end_date: number | null;
	is_current: boolean;
	items: StripeItemSnapshot[];
};
