import type { ApiPlan } from "@api/products/apiPlan.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import {
	type ProductItem,
	ProductItemType,
} from "@models/productV2Models/productItemModels/productItemModels.js";
import type { CreatePlanParams } from "../../api/products/planOpModels.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { getProductItemDisplay } from "../productDisplayUtils.js";
import { billingToItemInterval } from "../productV2Utils/productItemUtils/itemIntervalUtils.js";
import { planFeaturesToItems } from "./planFeaturesToItems.js";

/**
 * Construct a price item (base price with no feature)
 */
export const planToProductV2PriceItem = ({
	price,
	features,
}: {
	price: ApiPlan["price"];
	features: Feature[];
}): ProductItem => {
	const item = {
		type: ProductItemType.Price,
		feature_id: null,
		feature: null,
		interval: billingToItemInterval({
			billingInterval: price?.interval ?? BillingInterval.Month,
		}),
		interval_count: price?.interval_count ?? 1,
		price: price?.amount ?? 0,
	} satisfies ProductItem;

	const display = getProductItemDisplay({ item, features });

	return {
		...item,
		display,
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
		const priceItem = planToProductV2PriceItem({ price: plan.price, features });

		items.splice(0, 0, priceItem);
	}

	return items;
};
