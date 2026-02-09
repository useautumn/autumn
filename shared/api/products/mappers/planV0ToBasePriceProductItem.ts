import type {
	CreatePlanParams,
	UpdatePlanParams,
} from "@api/products/crud/planOpModels";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import {
	type ProductItem,
	ProductItemType,
} from "@models/productV2Models/productItemModels/productItemModels";
import { getProductItemDisplay } from "@utils/productDisplayUtils";
import { billingToItemInterval } from "@utils/productV2Utils/productItemUtils/itemIntervalUtils";
import type { SharedContext } from "../../../types";

export const planV0ToBasePriceProductItem = ({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: ApiPlan | CreatePlanParams | UpdatePlanParams;
}): ProductItem | undefined => {
	if (!plan.price) return;

	const basePrice = plan.price;

	const basePriceDisplay =
		"display" in basePrice ? basePrice.display : undefined;

	if (basePrice) {
		const item = {
			type: ProductItemType.Price,
			feature_id: null,
			feature: null,
			interval: billingToItemInterval({
				billingInterval: basePrice.interval ?? BillingInterval.Month,
			}),
			interval_count: basePrice.interval_count ?? 1,
			price: basePrice.amount ?? 0,
		} satisfies ProductItem;

		const display =
			basePriceDisplay ??
			getProductItemDisplay({ item, features: ctx.features });

		return {
			...item,
			display,
		};
	}
};
