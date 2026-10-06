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
	/** Quantity lines read "3x Pro". */
	quantity?: number;
}): string => {
	const config = price.config as FixedPriceConfig;

	const { product } = context;

	// biome-ignore lint/correctness/noUnusedVariables: Might be used in the future
	const amount = formatAmount({ currency, amount: config.amount });

	let description =
		quantity === undefined
			? product.name
			: `${numberWithCommas(quantity)}x ${product.name}`;

	if (!isOneOffPrice(price)) {
		const periodDescription = lineItemToPeriodDescription({
			context,
		});

		if (periodDescription) {
			description = `${description} (${periodDescription})`;
		}
	}

	if (context.direction === "refund") {
		description = `Unused ${description}`;
	}

	return description;
};
