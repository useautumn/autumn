import type { ItemDiff, PhaseMatch } from "../detect/types";

export const filterBlockingCustomFeaturePriceItems = ({
	phase,
}: {
	phase: PhaseMatch;
}): ItemDiff[] =>
	phase.item_diffs.filter((diff) => {
		const match = diff.match;
		if (match.kind !== "autumn_price") return false;
		if (match.matched_on.type !== "stripe_product_id") return false;

		const plan = phase.plans.find(
			(plan) => plan.product.internal_id === match.product.internal_id,
		);
		// An add-on with no base price is a legitimate, expected shape (mirrors
		// the absentBase carve-out above) — a keyed feature price is exactly
		// how a feature-only add-on is supposed to attach, not a red flag.
		if (plan?.product.is_add_on === true && plan.base.kind === "absent") {
			return false;
		}
		return plan?.base.kind !== "matched" && plan?.base.kind !== "custom";
	});
