import type {
	PhaseMatch,
	PlanWarning,
	SubscriptionMatch,
} from "../detect/types";
import { filterBlockingCustomFeaturePriceItems } from "./customFeaturePriceItems";
import { filterMainPlans, findDuplicateMainPlanGroup } from "./planGroupUtils";
import {
	type AutoSyncEligibility,
	type AutoSyncRejectionReason,
	DEFAULT_ALLOWED_WARNINGS,
} from "./types";

export type { AutoSyncEligibility, AutoSyncRejectionReason };

const findCurrentPhase = ({
	match,
}: {
	match: SubscriptionMatch;
}): PhaseMatch | null =>
	match.phaseMatches.find((phase) => phase.is_current) ?? null;

export const canAutoSync = ({
	match,
	allowedWarnings = DEFAULT_ALLOWED_WARNINGS,
}: {
	match: SubscriptionMatch;
	allowedWarnings?: PlanWarning["type"][];
}): AutoSyncEligibility => {
	const currentPhase = findCurrentPhase({ match });

	if (!currentPhase || currentPhase.plans.length === 0) {
		return {
			eligible: false,
			reason: "no_matched_plans",
			details: "No Autumn plans matched the current phase.",
		};
	}

	const mainPlans = filterMainPlans({ plans: currentPhase.plans });
	const duplicateMainPlanGroup =
		mainPlans.length > 1 ? findDuplicateMainPlanGroup({ mainPlans }) : null;
	if (duplicateMainPlanGroup) {
		return {
			eligible: false,
			reason: "multiple_main_plans",
			details: `Stripe sub matched ambiguous non-add-on Autumn plans: ${mainPlans
				.map((p) => p.product.id)
				.join(", ")} (${duplicateMainPlanGroup})`,
		};
	}

	const customFeaturePriceItems = filterBlockingCustomFeaturePriceItems({
		phase: currentPhase,
	});
	if (customFeaturePriceItems.length > 0) {
		return {
			eligible: false,
			reason: "custom_feature_price",
			details: `Stripe items use custom prices for feature items: ${customFeaturePriceItems
				.map((d) => d.stripe.id)
				.join(", ")}`,
		};
	}

	// Add-ons may legitimately have no base price (feature-only billing,
	// e.g. a prepaid add-on), and a parent present only via license seat
	// items has no base of its own — neither blocks on absent base.
	const absentBase = currentPhase.plans.find(
		(plan) =>
			plan.base.kind === "absent" &&
			plan.product.is_add_on !== true &&
			!plan.licenses?.length,
	);
	if (absentBase) {
		return {
			eligible: false,
			reason: "base_price_unresolvable",
			details: `Plan ${absentBase.product.id} has no resolvable base price.`,
		};
	}

	const bigQuantityPlan = currentPhase.plans.find((plan) =>
		plan.warnings.some((w) => w.type === "base_plan_quantity_gt_one"),
	);
	if (bigQuantityPlan) {
		return {
			eligible: false,
			reason: "base_quantity_gt_one",
			details: `Plan ${bigQuantityPlan.product.id} is not an add-on but its Stripe item has quantity > 1.`,
		};
	}

	const allowedSet = new Set(allowedWarnings);
	const blockingWarnings = currentPhase.plans.flatMap((plan) =>
		plan.warnings
			.filter((warning) => !allowedSet.has(warning.type))
			.map((warning) => ({ planId: plan.product.id, type: warning.type })),
	);
	if (blockingWarnings.length > 0) {
		return {
			eligible: false,
			reason: "plan_warnings",
			details: blockingWarnings.map((w) => `${w.planId}: ${w.type}`).join("; "),
		};
	}

	return { eligible: true };
};
