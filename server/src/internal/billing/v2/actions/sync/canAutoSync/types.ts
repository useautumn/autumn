import type { PlanWarning } from "../detect/types";

export type AutoSyncRejectionReason =
	| "no_matched_plans"
	| "multiple_main_plans"
	| "plan_warnings"
	| "base_price_unresolvable"
	| "custom_feature_price"
	| "future_phase_edited";

export type AutoSyncEligibility =
	| { eligible: true }
	| {
			eligible: false;
			reason: AutoSyncRejectionReason;
			details: string;
	  };

export const DEFAULT_ALLOWED_WARNINGS: PlanWarning["type"][] = [
	"base_price_dropped",
	"base_price_adopted",
];
