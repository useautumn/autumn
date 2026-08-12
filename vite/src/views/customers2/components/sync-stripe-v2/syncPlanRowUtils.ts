import {
	type CustomizePlanV1,
	type Feature,
	formatAmount,
	formatInterval,
	isPriceItem,
	type ProductItem,
	type ProductV2,
	planItemV0ToProductItem,
	planItemV1ToV0,
	type SharedContext,
} from "@autumn/shared";

/** A remove_items filter matches a feature item by its feature. */
const removesFeatureItem = ({
	filter,
	item,
}: {
	filter: NonNullable<CustomizePlanV1["remove_items"]>[number];
	item: ProductItem;
}): boolean =>
	filter.feature_id !== undefined && item.feature_id === filter.feature_id;

/**
 * Apply a `customize` block to a `ProductV2`, returning the effective
 * product. `customize.items` are V1 plan items (feature items only) — they
 * must be converted back to `ProductItem` shape, else the editor reads
 * `included_usage`/`price` off the wrong shape and renders NaN.
 *
 * Supports both PUT-style (`items`) and PATCH-style (`add_items` /
 * `remove_items`) customize, matching what the sync action applies.
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

	const toProductItem = (
		item: NonNullable<CustomizePlanV1["add_items"]>[number],
	): ProductItem[] => {
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
	};

	const catalogFeatureItems = productItems.filter((item) => !isPriceItem(item));

	let featureItems: ProductItem[];
	if (customize.items) {
		featureItems = customize.items.flatMap(toProductItem);
	} else {
		const removeFilters = customize.remove_items ?? [];
		const keptItems = catalogFeatureItems.filter(
			(item) =>
				!removeFilters.some((filter) => removesFeatureItem({ filter, item })),
		);
		featureItems = [
			...keptItems,
			...(customize.add_items ?? []).flatMap(toProductItem),
		];
	}

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
