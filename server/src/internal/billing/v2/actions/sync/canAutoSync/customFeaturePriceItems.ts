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
		return plan?.base.kind !== "matched";
	});
