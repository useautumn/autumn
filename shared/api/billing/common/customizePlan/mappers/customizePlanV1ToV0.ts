import { basePriceToProductItem } from "@api/products/components/basePrice/basePriceToProductItem";
import { planV1ToProductItems } from "@api/products/mappers/planV1ToProductItems";
import type { FullProduct } from "@models/productModels/productModels";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import { isPriceItem, mapToProductItems } from "@utils/index";
import { findSimilarItem } from "@utils/productV2Utils/compareProductUtils/compareItemUtils";
import type { SharedContext } from "../../../../../types/sharedContext";
import type { CustomizePlanV0 } from "../customizePlanV0";
import type { CustomizePlanV1 } from "../customizePlanV1";

const carryCurrentItemIds = ({
	items,
	currentProductItems,
}: {
	items: ProductItem[];
	currentProductItems: ProductItem[];
}) =>
	items.map((item) => {
		const currentItem = findSimilarItem({ item, items: currentProductItems });
		if (!currentItem) return item;

		return {
			...item,
			entitlement_id: item.entitlement_id ?? currentItem.entitlement_id,
			price_id: item.price_id ?? currentItem.price_id,
			created_at: item.created_at ?? currentItem.created_at,
		};
	});

export const customizePlanV1ToV0 = ({
	ctx,
	customizePlanV1,
	fullProduct,
}: {
	ctx: SharedContext;
	customizePlanV1: CustomizePlanV1;
	fullProduct: FullProduct;
}): CustomizePlanV0 => {
	const currentProductItems = mapToProductItems({
		prices: fullProduct.prices,
		entitlements: fullProduct.entitlements,
		features: ctx.features,
	});

	if (
		customizePlanV1.price !== undefined &&
		customizePlanV1.items !== undefined
	) {
		// 1. If price AND items provided, return full items array
		const items = planV1ToProductItems({
			ctx,
			plan: { price: customizePlanV1.price, items: customizePlanV1.items },
		});
		return carryCurrentItemIds({ items, currentProductItems });
	} else if (
		customizePlanV1.price !== undefined &&
		customizePlanV1.items === undefined
	) {
		// 2. If price provided, but no items, then customize base price and carry over feature items
		const featureItems = currentProductItems.filter(
			(item) => !isPriceItem(item),
		);

		const basePriceItem = customizePlanV1.price
			? basePriceToProductItem({
					ctx,
					basePrice: customizePlanV1.price,
				})
			: undefined;

		const items = basePriceItem
			? [basePriceItem, ...featureItems]
			: featureItems;
		return carryCurrentItemIds({ items, currentProductItems });
	} else {
		// 3. If no price provided, then carry over base price
		const basePriceItem = currentProductItems.filter((item) =>
			isPriceItem(item),
		);
		const featureItems = planV1ToProductItems({
			ctx,
			plan: { price: null, items: customizePlanV1.items ?? [] },
		});

		const items = [...basePriceItem, ...featureItems];
		return carryCurrentItemIds({ items, currentProductItems });
	}
};
