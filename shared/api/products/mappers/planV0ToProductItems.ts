import {
	apiPlanItem,
	type CreatePlanParams,
	type UpdatePlanParams,
} from "@api/models";
import type { ApiPlan } from "@api/products/apiPlan";
import { planV0ToBasePriceProductItem } from "@api/products/mappers/planV0ToBasePriceProductItem";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../types";

export const planV0ToProductItems = ({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: ApiPlan | CreatePlanParams | UpdatePlanParams;
}): ProductItem[] => {
	// Convert features to items
	const featureItems =
		plan.features?.map((planItem) =>
			apiPlanItem.map.v0ToProductItem({ ctx, planItem }),
		) ?? [];

	const basePriceItem = planV0ToBasePriceProductItem({ ctx, plan });

	if (basePriceItem) {
		featureItems.splice(0, 0, basePriceItem);
	}

	return featureItems;

	// if (plan.price) {
	// 	// Add base price if plan has one (independent of feature pricing)
	// 	const priceItem = planToProductV2PriceItem({ price: plan.price, features });

	// 	items.splice(0, 0, priceItem);
	// }

	// return items;
	// return [];
};
