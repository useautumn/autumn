import type { ApiPlan } from "@api/products/apiPlan.js";
import type { BillingInterval } from "@models/productModels/priceModels/priceEnums.js";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels.js";
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

	// Add base price if plan has one (independent of feature pricing)
	if (plan.price) {
		items.push(
			constructPriceItem({
				price: plan.price.amount,
				interval: plan.price.interval,
			}),
		);
	}

	return items;
};
