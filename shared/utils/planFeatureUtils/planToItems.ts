import type { ApiPlan, BillingInterval, ProductItem } from "@autumn/shared";
import { planFeaturesToItems } from "./planFeaturesToItems.js";

/**
 * Construct a price item (base price with no feature)
 */
export const constructPriceItem = ({
	price,
	interval,
	intervalCount,
}: {
	price: number;
	interval: BillingInterval | null;
	intervalCount?: number;
}): ProductItem => {
	return {
		price: price,
		interval: interval as any,
		interval_count: intervalCount || 1,
	};
};

/**
 * Convert ApiPlan to ProductItem[] (features + base price)
 * This is the shared logic used by both planToProductV2 and V1.2_ProductChanges
 */
export const convertPlanToItems = ({
	plan,
}: {
	plan: ApiPlan;
}): ProductItem[] => {
	// Convert features to items
	const featureItems = planFeaturesToItems({
		features: plan.features || [],
	});

	const items = [...featureItems];

	// Only add price item if there isn't a price on a feature already (aka: a "base price" product)
	const hasPriceItem = featureItems?.some(
		(item) => typeof item.price === "number" && item.price > 0,
	);

	if (plan.price && !hasPriceItem) {
		items.push(
			constructPriceItem({
				price: plan.price.amount,
				interval: plan.price.interval,
			}),
		);
	}

	return items;
};
