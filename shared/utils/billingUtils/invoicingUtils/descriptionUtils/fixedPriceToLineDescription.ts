import type { LineItemContext } from "@models/billingModels/lineItem/lineItemContext";
import type { FixedPriceConfig } from "../../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { formatAmount } from "../../../common/formatUtils/formatAmount";
import { numberWithCommas } from "../../../displayUtils";
import { isOneOffPrice } from "../../../productUtils/priceUtils/classifyPriceUtils";
import { lineItemToPeriodDescription } from "./lineItemToPeriodDescription";

export const fixedPriceToDescription = ({
	price,
	currency,
	context,
	quantity,
}: {
	price: Price; // must be fixed price
	currency?: string;
	context: LineItemContext;
	/** Quantity lines mirror the feature-usage format ("Pro - 150 credits"). */
	quantity?: number;
}): string => {
	const config = price.config as FixedPriceConfig;

	const { product } = context;

	// biome-ignore lint/correctness/noUnusedVariables: Might be used in the future
	const amount = formatAmount({ currency, amount: config.amount });

	const label =
		quantity === undefined
			? "Base Price"
			: `${numberWithCommas(quantity)}x Base Price`;
	let description = `${product.name} - ${label}`;

	if (!isOneOffPrice(price)) {
		const periodDescription = lineItemToPeriodDescription({
			context,
		});

		description = `${description} (${periodDescription})`;
	}

	if (context.direction === "refund") {
		description = `Unused ${description}`;
	}

	return description;
};
