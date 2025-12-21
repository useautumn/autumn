import {
	type FrontendProduct,
	formatAmount,
	getIntervalString,
	productV2ToBasePrice,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils";

export type BasePriceDisplayType =
	| "free"
	| "price"
	| "variable"
	| "placeholder";

export type BasePriceDisplayResult = {
	type: BasePriceDisplayType;
	formattedAmount?: string;
	intervalText?: string;
	displayText: string;
};

/**
 * Get base price display information for a product
 */
export const getBasePriceDisplay = ({
	product,
	currency = "USD",
	showPlaceholder = false,
}: {
	product: FrontendProduct;
	currency?: string;
	showPlaceholder?: boolean;
}): BasePriceDisplayResult => {
	const basePrice = productV2ToBasePrice({ product });

	// Check if it's a free plan
	if (product.planType === "free") {
		return {
			type: "free",
			displayText: "Free",
		};
	}

	// Check if there's a valid base price
	const priceExists = notNullish(basePrice) && basePrice.price > 0;
	if (priceExists && basePrice) {
		const formattedAmount = formatAmount({
			currency,
			amount: basePrice.price,
			amountFormatOptions: {
				style: "currency",
				currencyDisplay: "narrowSymbol",
			},
		});

		const intervalText = basePrice.interval
			? getIntervalString({
					interval: basePrice.interval,
					intervalCount: basePrice.interval_count,
				})
			: "one-off";

		return {
			type: "price",
			formattedAmount,
			intervalText,
			displayText: `${formattedAmount} ${intervalText}`,
		};
	}

	// Check if it's a usage-based (variable) price
	if (product.basePriceType === "usage") {
		return {
			type: "variable",
			displayText: "Variable",
		};
	}

	// Placeholder for empty state (editing context)
	if (showPlaceholder) {
		return {
			type: "placeholder",
			displayText: "Enter price",
		};
	}

	// Fallback - no base price means free
	return {
		type: "free",
		displayText: "Free",
	};
};
