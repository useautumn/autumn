import type {
	CustomizePlanV1,
	FullProduct,
	LicenseCustomize,
	ParentPlanLicense,
	Price,
} from "@autumn/shared";
import type {
	PriceMatchCondition,
	ProductMatchCondition,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/matchConditions";
import type { StripeItemSnapshot } from "@/internal/billing/v2/providers/stripe/utils/sync/stripeItemSnapshot/types";

export type ItemMatch =
	| {
			kind: "autumn_price";
			matched_on: PriceMatchCondition;
			price: Price;
			product: FullProduct;
	  }
	| {
			kind: "autumn_license";
			matched_on: PriceMatchCondition | ProductMatchCondition;
			price: Price | null;
			product: FullProduct;
			parent_plan_license: ParentPlanLicense;
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
	| { type: "base_plan_quantity_gt_one"; quantity: number }
	| { type: "license_price_unresolvable"; stripe_item_ids: string[] };

export type MatchedPlanLicense = {
	license_plan_id: string;
	quantity: number;
	stripe_item_id: string;
	customize?: LicenseCustomize;
};

export type MatchedPlan = {
	product: FullProduct;
	quantity: number;
	base: PlanBase;
	features: PlanFeature[];
	extras: PlanExtra[];
	customize?: CustomizePlanV1;
	warnings: PlanWarning[];
	licenses?: MatchedPlanLicense[];
};

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
