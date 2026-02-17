import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import { isPriceItem } from "../getItemType";
import { itemToBillingInterval } from "../itemIntervalUtils";

export const productItemToBasePriceParams = ({
	item,
}: {
	item: ProductItem;
}): BasePriceParams | undefined => {
	if (!isPriceItem(item)) return undefined;

	return {
		amount: item.price ?? 0,
		interval: itemToBillingInterval({ item }),
		interval_count: item.interval_count ?? undefined,

		entitlement_id: item.entitlement_id ?? undefined,
		price_id: item.price_id ?? undefined,
	};
};
