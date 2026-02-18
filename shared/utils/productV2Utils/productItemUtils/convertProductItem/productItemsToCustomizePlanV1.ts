import type { CustomizePlanV1 } from "@api/billing/common/customizePlan/customizePlanV1";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../../types/sharedContext";
import { isPriceItem } from "../getItemType";
import { productItemToBasePriceParams } from "./productItemToBasePriceParams";
import { productItemToPlanItemParamsV1 } from "./productItemToPlanItemParamsV1";

export const productItemsToCustomizePlanV1 = ({
	ctx,
	items,
}: {
	ctx: SharedContext;
	items: ProductItem[];
}): CustomizePlanV1 => {
	const priceItem = items.find((item) => isPriceItem(item));

	const basePriceParams = priceItem
		? productItemToBasePriceParams({ item: priceItem })
		: null; // needs to be null to remove the base price

	const featureItems = items.filter((item) => !isPriceItem(item));

	const featureItemsParams = featureItems.map((item) =>
		productItemToPlanItemParamsV1({ ctx, item }),
	);

	return {
		price: basePriceParams,
		items: featureItemsParams,
	};
};
