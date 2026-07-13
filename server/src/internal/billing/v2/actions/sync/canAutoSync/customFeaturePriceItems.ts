import type { SyncPhase } from "@autumn/shared";
import type { ItemDiff, MatchedPlan, PhaseMatch } from "../detect/types";
import { customizeResolvesFeaturePrice } from "./customizeResolvesFeaturePrice";

const findMatchedPlan = ({
	phase,
	diff,
}: {
	phase: PhaseMatch;
	diff: ItemDiff;
}): MatchedPlan | null => {
	if (diff.match.kind === "none") return null;
	for (const plan of phase.plans) {
		if (plan.product.internal_id === diff.match.product.internal_id) return plan;
	}
	return null;
};

const hasExactlyOneResolvingSyncPlan = ({
	syncPhase,
	diff,
}: {
	syncPhase?: SyncPhase;
	diff: ItemDiff;
}): boolean => {
	let foundResolution = false;
	for (const plan of syncPhase?.plans ?? []) {
		if (!customizeResolvesFeaturePrice({ syncPlan: plan, diff })) continue;
		if (foundResolution) return false;
		foundResolution = true;
	}
	return foundResolution;
};

export const filterBlockingCustomFeaturePriceItems = ({
	phase,
	syncPhase,
}: {
	phase: PhaseMatch;
	syncPhase?: SyncPhase;
}): ItemDiff[] =>
	phase.item_diffs.filter((diff) => {
		const match = diff.match;
		if (match.kind !== "autumn_price") return false;
		if (match.matched_on.type !== "stripe_product_id") return false;

		const plan = findMatchedPlan({ phase, diff });
		// Feature-only add-ons legitimately attach through a keyed feature price.
		if (plan?.product.is_add_on === true && plan.base.kind === "absent") {
			return false;
		}
		if (plan?.base.kind === "matched") return false;

		return !hasExactlyOneResolvingSyncPlan({ syncPhase, diff });
	});
