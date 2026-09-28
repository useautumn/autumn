import {
	formatAmount,
	type ProcessorItem,
	type ProcessorItemPrice,
} from "@autumn/shared";
import type { ReviewChangeValue } from "./types/reviewChange";

const INTERVAL_ABBREVIATION: Record<
	NonNullable<ProcessorItemPrice["interval"]>,
	string
> = {
	day: "day",
	week: "wk",
	month: "mo",
	year: "yr",
};

const ONE_OFF_SUFFIX = "one-off";

export const formatMoney = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	formatAmount({
		amount,
		currency,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

/** "/mo", "/3 mo", or "one-off" for a price without a recurring interval. */
export const priceIntervalSuffix = (price: ProcessorItemPrice) => {
	if (!price.interval) return ONE_OFF_SUFFIX;
	const unit = INTERVAL_ABBREVIATION[price.interval];
	return price.interval_count > 1
		? `/${price.interval_count} ${unit}`
		: `/${unit}`;
};

/** How the item is charged, e.g. "4 × $10", "$5 per 100, billed on usage", "Graduated tiers". */
export const unitPriceDetail = ({
	price,
	quantity,
}: {
	price: ProcessorItemPrice;
	quantity: number | null;
}) => {
	if (price.tiers) {
		return price.tiers_mode === "volume" ? "Volume tiers" : "Graduated tiers";
	}
	if (price.unit_amount === null) return undefined;

	const unitPrice = formatMoney({
		amount: price.unit_amount,
		currency: price.currency,
	});
	const unitsPerQuantity = price.units_per_quantity ?? 1;
	const unitLabel =
		unitsPerQuantity > 1
			? `${unitPrice} per ${unitsPerQuantity.toLocaleString()}`
			: unitPrice;

	if (price.usage_type === "metered") {
		const perUnit = unitsPerQuantity > 1 ? unitLabel : `${unitLabel} each`;
		return `${perUnit}, billed on usage`;
	}
	return quantity === null
		? `${unitLabel} each`
		: `${quantity.toLocaleString()} × ${unitLabel}`;
};

/** What the item costs each interval, or how it's billed when that depends on usage. */
export const processorItemValue = (
	item: ProcessorItem,
): ReviewChangeValue | undefined => {
	const { price } = item;
	if (!price) return undefined;

	if (item.amount !== null) {
		return {
			amount: formatMoney({ amount: item.amount, currency: price.currency }),
			suffix: priceIntervalSuffix(price),
		};
	}
	if (price.usage_type === "metered") return { amount: "Usage-based" };
	if (price.tiers) return { amount: "Tiered" };
	return undefined;
};

/** Sum of fixed charges in a phase, when every priced item shares one interval and currency. */
export const processorItemsTotal = (items: ProcessorItem[]) => {
	const pricedItems = items.filter(
		(item): item is ProcessorItem & { price: ProcessorItemPrice } =>
			item.price !== null && item.amount !== null,
	);
	const [first] = pricedItems;
	if (!first) return undefined;

	const sharesBilling = pricedItems.every(
		(item) =>
			item.price.currency === first.price.currency &&
			priceIntervalSuffix(item.price) === priceIntervalSuffix(first.price),
	);
	if (!sharesBilling) return undefined;

	const total = pricedItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
	return `${formatMoney({ amount: total, currency: first.price.currency })}${priceIntervalSuffix(first.price)}`;
};
