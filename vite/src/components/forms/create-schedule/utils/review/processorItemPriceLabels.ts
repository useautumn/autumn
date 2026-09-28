import {
	numberWithCommas,
	type ProcessorItem,
	type ProcessorItemPrice,
} from "@autumn/shared";
import { intervalSuffix } from "@/utils/formatUtils/intervalSuffix";
import { formatMoney } from "./formatMoney";
import type { ReviewChangeValue } from "./types/reviewChange";

const ONE_OFF_SUFFIX = "one-off";

/** "/mo", "/3 mo", or "one-off" for a price without a recurring interval. */
const priceIntervalSuffix = (price: ProcessorItemPrice) => {
	if (!price.interval) return ONE_OFF_SUFFIX;
	return intervalSuffix({
		interval: price.interval,
		intervalCount: price.interval_count,
	});
};

/** How the item is charged, e.g. "4 × $10", "$5 per 100, billed on usage", "10 × Graduated tiers". */
export const unitPriceDetail = ({
	price,
	quantity,
}: {
	price: ProcessorItemPrice;
	quantity: number | null;
}) => {
	if (price.tiers) {
		const tierLabel =
			price.tiers_mode === "volume" ? "Volume tiers" : "Graduated tiers";
		return quantity === null
			? tierLabel
			: `${numberWithCommas(quantity)} × ${tierLabel}`;
	}
	if (price.unit_amount === null) return undefined;

	const unitPrice = formatMoney({
		amount: price.unit_amount,
		currency: price.currency,
	});
	const unitsPerQuantity = price.units_per_quantity ?? 1;
	const unitLabel =
		unitsPerQuantity > 1
			? `${unitPrice} per ${numberWithCommas(unitsPerQuantity)}`
			: unitPrice;

	if (price.usage_type === "metered") {
		const perUnit = unitsPerQuantity > 1 ? unitLabel : `${unitLabel} each`;
		return `${perUnit}, billed on usage`;
	}
	return quantity === null
		? `${unitLabel} each`
		: `${numberWithCommas(quantity)} × ${unitLabel}`;
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
