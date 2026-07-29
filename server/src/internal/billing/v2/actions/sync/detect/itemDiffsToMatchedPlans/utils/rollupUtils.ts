import type { FullProduct } from "@autumn/shared";
import type { PlanBaseDecision } from "@/internal/billing/v2/actions/sync/detect/itemDiffsToMatchedPlans/decidePlanBase";
import type { ItemDiff, PlanExtra, PlanWarning } from "../../types";

export type PlanDiffGroup = { product: FullProduct; diffs: ItemDiff[] };

/** License hits belong to the PARENT plan offering the license; unmatched
 * items belong to no plan. */
const planForDiff = ({ diff }: { diff: ItemDiff }): FullProduct | null => {
	const { match } = diff;
	if (match.kind === "none") return null;
	if (match.kind === "autumn_license") return match.parent_plan_license.product;
	return match.product;
};

/** Step ① — bucket the flat diffs by the plan each one belongs to. */
export const groupItemDiffsByPlan = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): PlanDiffGroup[] => {
	const groupsByInternalId = new Map<string, PlanDiffGroup>();
	for (const diff of itemDiffs) {
		const product = planForDiff({ diff });
		if (!product) continue;
		const group = groupsByInternalId.get(product.internal_id) ?? {
			product,
			diffs: [],
		};
		group.diffs.push(diff);
		groupsByInternalId.set(product.internal_id, group);
	}
	return [...groupsByInternalId.values()];
};

/** Step ③d — the plan's structural oddities. canAutoSync rejects any plan
 * that carries one, so these are the reasons auto-sync will refuse it. */
export const derivePlanWarnings = ({
	baseDecision,
	extras,
	quantity,
	isAddOn,
}: {
	baseDecision: PlanBaseDecision;
	extras: PlanExtra[];
	quantity: number;
	isAddOn: boolean;
}): PlanWarning[] => {
	const warnings: PlanWarning[] = [...baseDecision.warnings];
	if (extras.length > 0) {
		warnings.push({
			type: "extra_items_under_plan",
			stripe_item_ids: extras.map((extra) => extra.stripe_item_id),
		});
	}
	if (baseDecision.baseStripeItem && quantity > 1 && !isAddOn) {
		warnings.push({ type: "base_plan_quantity_gt_one", quantity });
	}
	return warnings;
};
