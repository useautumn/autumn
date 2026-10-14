import {
	type CustomizePlanV1,
	type Feature,
	Infinite,
	isPriceItem,
	type ProductItem,
	type ProductV2,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
} from "@autumn/shared";

const flatPriceToSingleTier = (item: ProductItem): ProductItem =>
	item.feature_id && item.price != null && !item.tiers?.length
		? {
				...item,
				price: undefined,
				tiers: [{ to: Infinite, amount: item.price }],
			}
		: item;

export const applyCustomizeToProduct = ({
	product,
	customize,
	features,
}: {
	product: ProductV2;
	customize: CustomizePlanV1 | undefined;
	features: Feature[];
}): ProductV2 => {
	if (!customize) return product;

	const ctx = { features } as unknown as SharedContext;
	const productItems = product.items ?? [];

	const featureItems: ProductItem[] = customize.items
		? customize.items.flatMap((item) => {
				try {
					return [
						flatPriceToSingleTier(
							planItemV0ToProductItem({
								ctx,
								planItem: planItemV1ToV0({ ctx, item }),
							}),
						),
					];
				} catch {
					return [];
				}
			})
		: productItems.filter((item) => !isPriceItem(item));

	let priceItems: ProductItem[];
	if (customize.price === undefined) {
		priceItems = productItems.filter((item) => isPriceItem(item));
	} else if (customize.price === null) {
		priceItems = [];
	} else {
		priceItems = [
			{
				price: customize.price.amount,
				interval: customize.price.interval,
				interval_count: customize.price.interval_count ?? 1,
				price_config: {
					amount: customize.price.amount,
					interval: customize.price.interval,
					interval_count: customize.price.interval_count ?? 1,
					stripe_price_id: customize.price.stripe_price_id,
				},
			} as ProductItem,
		];
	}

	return { ...product, items: [...priceItems, ...featureItems] };
};
