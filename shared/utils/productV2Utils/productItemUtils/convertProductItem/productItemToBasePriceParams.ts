import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import { isPriceItem } from "../getItemType";
import {
	itemToBillingInterval,
	itemToBillingIntervalCount,
} from "../itemIntervalUtils";

export const productItemToBasePriceParams = ({
	item,
}: {
	item: ProductItem;
}): BasePriceParams | undefined => {
	if (!isPriceItem(item)) return undefined;

	return {
		amount: item.price ?? 0,
		interval: itemToBillingInterval({ item }),
		interval_count: itemToBillingIntervalCount({ item }) ?? undefined,

		additional_currencies: item.additional_currencies ?? undefined,
		base_currency: item.base_currency ?? undefined,

		entitlement_id: item.entitlement_id ?? undefined,
		price_id: item.price_id ?? undefined,
	};
};
