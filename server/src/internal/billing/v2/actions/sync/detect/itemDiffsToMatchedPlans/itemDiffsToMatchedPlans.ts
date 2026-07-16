import { type FullProduct, productToBasePrice } from "@autumn/shared";
import { isFeaturePriceMatch } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/classifyItemMatch";
import type { ItemDiff, MatchedPlan, PlanExtra, PlanFeature } from "../types";
import { decidePlanBase } from "./decidePlanBase";
import { derivePlanQuantity } from "./derivePlanQuantity";
import { rollupPlanLicenses } from "./rollupPlanLicenses";
import { derivePlanWarnings, groupItemDiffsByPlan } from "./utils/rollupUtils";

/**
 * Turn flat per-item diffs into per-plan verdicts:
 * ① group — which plan owns each Stripe item
 * ② derive — base, quantity, features, licenses, extras, warnings.
 */
export const itemDiffsToMatchedPlans = ({
	itemDiffs,
}: {
	itemDiffs: ItemDiff[];
}): MatchedPlan[] => {
	const itemDiffsByPlan = groupItemDiffsByPlan({ itemDiffs });

	const matchedPlans: MatchedPlan[] = [];
	for (const { product, diffs } of itemDiffsByPlan) {
		matchedPlans.push(diffsToMatchedPlan({ product, diffs }));
	}
	return matchedPlans;
};

const diffsToMatchedPlan = ({
	product,
	diffs,
}: {
	product: FullProduct;
	diffs: ItemDiff[];
}): MatchedPlan => {
	const basePrice = productToBasePrice({ product });

	const baseDecision = decidePlanBase({ diffs, basePrice });

	const features: PlanFeature[] = diffs.flatMap((diff) =>
		isFeaturePriceMatch(diff.match)
			? [
					{
						stripe_item_id: diff.stripe.id,
						autumn_price_id: diff.match.price.id,
					},
				]
			: [],
	);
	const extras: PlanExtra[] = baseDecision.extraDiffs.map((diff) => ({
		stripe_item_id: diff.stripe.id,
	}));
	const { licenses, warnings: licenseWarnings } = rollupPlanLicenses({
		diffs,
	});
	const quantity = derivePlanQuantity({
		baseStripeItem: baseDecision.baseStripeItem,
		diffs,
	});

	return {
		product,
		quantity,
		base: baseDecision.base,
		features,
		extras,
		customize: baseDecision.customize,
		warnings: [
			...derivePlanWarnings({
				baseDecision,
				extras,
				quantity,
				isAddOn: product.is_add_on === true,
			}),
			...licenseWarnings,
		],
		...(licenses.length > 0 ? { licenses } : {}),
	};
};
