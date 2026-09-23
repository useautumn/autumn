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

/** Plan items carry a one-tier price as a flat amount, but the item editor only
 * renders a price input for tiers — restore the one-tier form. */
const flatPriceToSingleTier = (item: ProductItem): ProductItem =>
	item.feature_id && item.price != null && !item.tiers?.length
		? {
				...item,
				price: undefined,
				tiers: [{ to: Infinite, amount: item.price }],
			}
		: item;

/**
 * Apply a `customize` block to a `ProductV2`, returning the effective
 * product. `customize.items` are V1 plan items (feature items only) — they
 * must be converted back to `ProductItem` shape, else the editor reads
 * `included_usage`/`price` off the wrong shape and renders NaN.
 */
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
					// Conversion throws if the feature referenced in `customize` has been
					// deleted since it was saved; drop that item instead of crashing the editor.
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
			} as ProductItem,
		];
	}

	return { ...product, items: [...priceItems, ...featureItems] };
};
