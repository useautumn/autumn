import type { ApiPlan } from "@api/products/apiPlan.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels.js";
import type { CreatePlanParams } from "../../api/products/planOpModels.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { billingToItemInterval } from "../productV2Utils/productItemUtils/itemIntervalUtils.js";
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
		interval: billingToItemInterval({
			billingInterval: interval ?? BillingInterval.Month,
		}),
		interval_count: intervalCount || 1,
	};
};

/**
 * Convert ApiPlan to ProductItem[] (features + base price)
 * This is the shared logic used by both planToProductV2 and V1.2_ProductChanges
 */
export const convertPlanToItems = ({
	plan,
	features,
}: {
	plan: ApiPlan | CreatePlanParams;
	features: Feature[];
}): ProductItem[] => {
	// Convert features to items
	const featureItems = planFeaturesToItems({
		planFeatures: plan.features || [],
		features,
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
