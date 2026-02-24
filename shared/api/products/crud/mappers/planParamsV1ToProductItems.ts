import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import { basePriceToProductItem } from "@api/products/components/basePrice/basePriceToProductItem";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import { planV1ToProductItems } from "@api/products/mappers/planV1ToProductItems";
import type { FullProduct } from "@models/productModels/productModels";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import { isPriceItem, mapToProductItems } from "@utils/index";
import type { SharedContext } from "../../../../types/sharedContext";

export function planParamsV1ToProductItems({
	ctx,
	params,
	currentFullProduct,
}: {
	ctx: SharedContext;
	// params: CreatePlanParams | UpdatePlanParams;
	params: {
		price?: BasePriceParams | null;
		items?: CreatePlanItemParamsV1[];
	};
	currentFullProduct?: FullProduct;
}): ProductItem[] | undefined {
	const currentProductItems = mapToProductItems({
		prices: currentFullProduct?.prices ?? [],
		entitlements: currentFullProduct?.entitlements ?? [],
		features: ctx.features,
	});

	if (params.price === undefined && params.items === undefined) {
		return undefined;
	}

	if (params.price !== undefined && params.items !== undefined) {
		// 1. If price AND items provided, return full items array
		return planV1ToProductItems({
			ctx,
			plan: { price: params.price, items: params.items },
		});
	}

	if (params.price !== undefined && params.items === undefined) {
		// 2. If price provided, but no items, then customize base price and carry over feature items
		const featureItems = currentProductItems.filter(
			(item) => !isPriceItem(item),
		);

		const basePriceItem = params.price
			? basePriceToProductItem({
					ctx,
					basePrice: params.price,
				})
			: undefined;

		return basePriceItem ? [basePriceItem, ...featureItems] : featureItems;
	}

	// 3. If no price provided, then carry over base price
	const basePriceItem = currentProductItems.filter((item) => isPriceItem(item));
	const featureItems = planV1ToProductItems({
		ctx,
		plan: { price: null, items: params.items ?? [] },
	});

	return [...basePriceItem, ...featureItems];
}
