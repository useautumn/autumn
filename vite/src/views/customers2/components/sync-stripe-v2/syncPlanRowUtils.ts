import {
	type CustomizePlanV1,
	formatAmount,
	formatInterval,
	isPriceItem,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";

/**
 * Apply a `customize` block to a `ProductV2`, returning the effective
 * product. Items override the full set when present; a base price override
 * (`customize.price`) replaces the existing fixed price item or is
 * appended.
 */
export const applyCustomizeToProduct = ({
	product,
	customize,
}: {
	product: ProductV2;
	customize: CustomizePlanV1 | undefined;
}): ProductV2 => {
	if (!customize) return product;

	let items: ProductItem[] = customize.items ?? product.items ?? [];

	if (customize.price !== undefined) {
		if (customize.price === null) {
			items = items.filter((item) => !isPriceItem(item));
		} else {
			const newPriceItem: ProductItem = {
				price: customize.price.amount,
				interval: customize.price.interval,
				interval_count: customize.price.interval_count ?? 1,
			} as ProductItem;
			const existingIndex = items.findIndex((item) => isPriceItem(item));
			if (existingIndex >= 0) {
				items = items.map((item, i) => (i === existingIndex ? newPriceItem : item));
			} else {
				items = [newPriceItem, ...items];
			}
		}
	}

	return { ...product, items };
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
