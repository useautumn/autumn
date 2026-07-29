import {
	type CustomizePlanV1,
	type Feature,
	formatAmount,
	formatInterval,
	isPriceItem,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type ProductItem,
	type ProductV2,
	type SharedContext,
} from "@autumn/shared";

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
						planItemV0ToProductItem({
							ctx,
							planItem: planItemV1ToV0({ ctx, item }),
						}),
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

/**
 * Format the base (fixed) price of a ProductV2 as a single-line label
 * like "$20 per month" or "Free".
 */
export const getBasePriceLabel = ({
	product,
	currency,
}: {
	product: ProductV2;
	currency: string;
}): string => {
	const priceItem = product.items?.find((item) => isPriceItem(item));
	if (!priceItem || priceItem.price === 0 || priceItem.price === undefined) {
		return "Free";
	}

	const formattedPrice = formatAmount({
		currency,
		amount: priceItem.price ?? 0,
		amountFormatOptions: {
			style: "currency",
			currencyDisplay: "narrowSymbol",
		},
	});
	const intervalText = priceItem.interval
		? formatInterval({
				interval: priceItem.interval,
				intervalCount: priceItem.interval_count ?? 1,
			})
		: "one-off";

	return `${formattedPrice} ${intervalText}`;
};
