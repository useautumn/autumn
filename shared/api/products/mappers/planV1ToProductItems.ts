import {
	type ApiPlanItemV1,
	planItemV0ToProductItem,
	planItemV1ToV0,
} from "@api/models";
import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import { basePriceToProductItem } from "@api/products/components/basePrice/basePriceToProductItem";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../types";
import type { CreatePlanItemParamsV1 } from "../items/crud/createPlanItemParamsV1";

// Required.
export const planV1ToProductItems = ({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: {
		items: ApiPlanItemV1[] | CreatePlanItemParamsV1[];
		price: ApiPlan["price"] | BasePriceParams;
	};
}): ProductItem[] => {
	// Convert features to items
	const featureItems =
		plan.items?.map((planItem) => {
			const planV0 = planItemV1ToV0({ ctx, item: planItem });
			return planItemV0ToProductItem({ ctx, planItem: planV0 });
		}) ?? [];

	const basePriceItem = plan.price
		? basePriceToProductItem({ ctx, basePrice: plan.price })
		: undefined;

	if (basePriceItem) {
		featureItems.splice(0, 0, basePriceItem);
	}

	return featureItems;
};
