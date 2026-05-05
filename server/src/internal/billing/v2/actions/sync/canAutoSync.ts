import type {
	PhaseMatch,
	PlanWarning,
	SubscriptionMatch,
} from "./detect/types";

export type AutoSyncRejectionReason =
	| "no_matched_plans"
	| "multiple_main_plans"
	| "plan_warnings"
	| "base_price_unresolvable"
	| "custom_feature_price"
	| "base_quantity_gt_one";

export type AutoSyncEligibility =
	| { eligible: true }
	| {
			eligible: false;
			reason: AutoSyncRejectionReason;
			details: string;
	  };

const findCurrentPhase = ({
	match,
}: {
	match: SubscriptionMatch;
}): PhaseMatch | null =>
	match.phaseMatches.find((phase) => phase.is_current) ?? null;

/**
 * Default warnings that auto-sync tolerates without human review:
 *   - `base_price_dropped` — Autumn product has a base price but the Stripe
 *     sub omits it; the sync materializes the cusProduct with
 *     `customize: { price: null }`.
 *   - `base_price_adopted` — strategy A: an unclaimed extra item filled in
 *     for the missing base. Captured via `customize.price`.
 *
 * Blocking warnings (NOT in this default set):
 *   - `extra_items_under_plan` — extras Autumn can't yet express; ambiguous.
 *   - `base_plan_quantity_gt_one` — handled separately below.
 */
const DEFAULT_ALLOWED_WARNINGS: PlanWarning["type"][] = [
	"base_price_dropped",
	"base_price_adopted",
];

/**
 * Decide whether a `SubscriptionMatch` is safe to sync without human review.
 *
 * Conservative defaults — eligible iff the current phase:
 *   - has at least one MatchedPlan
 *   - has no MatchedPlan with `base.kind === "absent"` (Autumn product
 *     expects a base price but none could be derived)
 *   - has no Stripe item matching a non-base Autumn price via product id
 *     (custom feature price)
 *   - has no non-add-on plan with Stripe item quantity > 1
 *   - emits only PlanWarnings in `allowedWarnings`
 *
 * Stripe items that don't match anything (`ItemDiff.match.kind === "none"`)
 * are tolerated — they're external/unrelated prices that don't influence
 * the Autumn cusProducts being attached.
 */
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

	// More than one non-add-on plan in the current phase is ambiguous —
	// "main" plans are mutually exclusive within a customer (typically a
	// single tier per product group). Auto-sync requires a clear primary
	// plan to attach; add-ons may stack on top.
	const mainPlans = currentPhase.plans.filter(
		(plan) => plan.product.is_add_on !== true,
	);
	if (mainPlans.length > 1) {
		return {
			eligible: false,
			reason: "multiple_main_plans",
			details: `Stripe sub matched multiple non-add-on Autumn plans: ${mainPlans.map((p) => p.product.id).join(", ")}`,
		};
	}

	// Block when any Stripe item matches a non-base Autumn price via
	// stripe_product_id (priority-2). That signals a custom Stripe price
	// for a feature/prepaid item — we don't auto-rewrite feature prices on
	// sync. Custom BASE prices (priority-3, kind: "autumn_product") are
	// allowed since `customize.price` captures them safely.
	const customFeaturePriceItems = currentPhase.item_diffs.filter(
		(diff) =>
			diff.match.kind === "autumn_price" &&
			diff.match.matched_on.type === "stripe_product_id",
	);
	if (customFeaturePriceItems.length > 0) {
		return {
			eligible: false,
			reason: "custom_feature_price",
			details: `Stripe items use custom prices for feature items: ${customFeaturePriceItems
				.map((d) => d.stripe.id)
				.join(", ")}`,
		};
	}

	const absentBase = currentPhase.plans.find(
		(plan) => plan.base.kind === "absent",
	);
	if (absentBase) {
		return {
			eligible: false,
			reason: "base_price_unresolvable",
			details: `Plan ${absentBase.product.id} has no resolvable base price.`,
		};
	}

	// Stripe item quantity > 1 on a non-add-on plan is ambiguous (the
	// detection rollup tags it via the `base_plan_quantity_gt_one` warning).
	// We surface a dedicated rejection reason so logs are explicit.
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
			.map(
				(warning) => ({ planId: plan.product.id, type: warning.type }),
			),
	);
	if (blockingWarnings.length > 0) {
		return {
			eligible: false,
			reason: "plan_warnings",
			details: blockingWarnings
				.map((w) => `${w.planId}: ${w.type}`)
				.join("; "),
		};
	}

	return { eligible: true };
};
