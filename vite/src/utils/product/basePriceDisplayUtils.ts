import {
	type AdditionalCurrencyPrice,
	type FrontendProduct,
	formatAmount,
	formatInterval,
	productV2ToBasePrice,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils";

export const PRICE_VARIES_LABEL = "Price varies";

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
	additionalCurrencies?: AdditionalCurrencyPrice[];
};

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

	if (product.planType === "free") {
		return {
			type: "free",
			displayText: "Free",
		};
	}

	const priceExists = notNullish(basePrice) && basePrice.price >= 0;
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
			? formatInterval({
					interval: basePrice.interval,
					intervalCount: basePrice.interval_count,
				})
			: "one-off";

		return {
			type: "price",
			formattedAmount,
			intervalText,
			displayText: `${formattedAmount} ${intervalText}`,
			additionalCurrencies: basePrice.additional_currencies ?? undefined,
		};
	}

	if (product.basePriceType === "usage") {
		return {
			type: "variable",
			displayText: "Variable",
		};
	}

	if (showPlaceholder) {
		return {
			type: "placeholder",
			displayText: "Enter price",
		};
	}

	return {
		type: "free",
		displayText: "Free",
	};
};
