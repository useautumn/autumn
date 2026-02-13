import { type ApiPlanItemV0, apiPlanItem } from "@api/models";
import { planV0ToBasePriceProductItem } from "@api/products/mappers/planV0ToBasePriceProductItem";
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
		price: ApiPlan["price"];
	};
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
};
