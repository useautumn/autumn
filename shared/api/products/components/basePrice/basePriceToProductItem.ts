import type {
	BasePrice,
	BasePriceParams,
} from "@api/products/components/basePrice/basePrice";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import {
	type ProductItem,
	ProductItemType,
} from "@models/productV2Models/productItemModels/productItemModels";
import { getProductItemDisplay } from "@utils/productDisplayUtils";
import { billingToItemInterval } from "@utils/productV2Utils/productItemUtils/itemIntervalUtils";
import type { SharedContext } from "../../../../types/sharedContext";

export const basePriceToProductItem = ({
	ctx,
	basePrice,
}: {
	ctx: SharedContext;
	basePrice: BasePrice | BasePriceParams;
}): ProductItem => {
	const basePriceDisplay =
		"display" in basePrice ? basePrice.display : undefined;

	const entitlementId =
		"entitlement_id" in basePrice
			? (basePrice.entitlement_id ?? undefined)
			: undefined;
	const priceId =
		"price_id" in basePrice ? (basePrice.price_id ?? undefined) : undefined;

	const item = {
		type: ProductItemType.Price,
		feature_id: null,
		feature: null,
		interval: billingToItemInterval({
			billingInterval: basePrice.interval ?? BillingInterval.Month,
		}),
		interval_count: basePrice.interval_count ?? 1,
		price: basePrice.amount ?? 0,

		entitlement_id: entitlementId,
		price_id: priceId,
	} satisfies ProductItem;

	const display = basePriceDisplay
		? getProductItemDisplay({ item, features: ctx.features })
		: undefined;

	return {
		...item,
		display,
	};
};
