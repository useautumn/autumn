import type { CustomizePlanV1, FullProduct, Price } from "@autumn/shared";
import type {
	PriceMatchCondition,
	ProductMatchCondition,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/matchConditions";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

/* -------------------------------------------------------------------------
 * Item-level: per Stripe item, what did it match against in Autumn?
 * Pure stripe-side fact. No sibling-aware decisions.
 *
 * Each variant mirrors which matchUtils finder produced the match, with
 * the matched Autumn resource(s) embedded directly so consumers never need
 * a side lookup map.
 * ------------------------------------------------------------------------- */

export type ItemMatch =
	| {
			kind: "autumn_price";
			matched_on: PriceMatchCondition;
			price: Price;
			product: FullProduct;
	  }
	| {
			kind: "autumn_product";
			matched_on: ProductMatchCondition;
			product: FullProduct;
	  }
	| { kind: "none" };

export type ItemDiff = {
	stripe: StripeItemSnapshot;
	match: ItemMatch;
};

/* -------------------------------------------------------------------------
 * Plan-level: per Autumn product, the rolled-up structural verdict
 * ------------------------------------------------------------------------- */

export type PlanBase =
	| { kind: "matched"; stripe_item_id: string; autumn_price_id: string }
	| { kind: "custom"; stripe_item_id: string }
	| { kind: "adopted"; stripe_item_id: string }
	| { kind: "dropped" }
	| { kind: "absent" };

export type PlanFeature = {
	stripe_item_id: string;
	autumn_price_id: string;
};

export type PlanExtra = {
	stripe_item_id: string;
};

export type PlanWarning =
	| { type: "base_price_dropped" }
	| { type: "base_price_adopted"; stripe_item_id: string }
	| { type: "extra_items_under_plan"; stripe_item_ids: string[] }
	| { type: "base_plan_quantity_gt_one"; quantity: number };

export type MatchedPlan = {
	product: FullProduct;
	quantity: number;
	base: PlanBase;
	features: PlanFeature[];
	extras: PlanExtra[];
	customize?: CustomizePlanV1;
	warnings: PlanWarning[];
};

/* -------------------------------------------------------------------------
 * Phase / subscription level
 * ------------------------------------------------------------------------- */

export type PhaseMatch = {
	start_date: number;
	end_date: number | null;
	is_current: boolean;
	item_diffs: ItemDiff[];
	plans: MatchedPlan[];
};

export type SubscriptionMatch = {
	stripe_subscription_id: string | null;
	stripe_schedule_id: string | null;
	phaseMatches: PhaseMatch[];
};
