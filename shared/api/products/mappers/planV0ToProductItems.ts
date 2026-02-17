import { type ApiPlanItemV0, apiPlanItem } from "@api/models";
import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import { basePriceToProductItem } from "@api/products/components/basePrice/basePriceToProductItem";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../types";

// Required.
export const planV0ToProductItems = ({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: {
		features: ApiPlanItemV0[];
		price: ApiPlan["price"] | BasePriceParams;
	};
}): ProductItem[] => {
	// Convert features to items
	const featureItems =
		plan.features?.map((planItem) =>
			apiPlanItem.map.v0ToProductItem({ ctx, planItem }),
		) ?? [];

	const basePriceItem = plan.price
		? basePriceToProductItem({ ctx, basePrice: plan.price })
		: undefined;

	if (basePriceItem) {
		featureItems.splice(0, 0, basePriceItem);
	}

	return featureItems;
};
