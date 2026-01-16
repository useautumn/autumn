import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { FixedPriceConfig } from "../../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { formatAmount } from "../../../common/formatUtils/formatAmount";
import { isOneOffPrice } from "../../../productUtils/priceUtils/classifyPriceUtils";
import { lineItemToPeriodDescription } from "./lineItemToPeriodDescription";

export const fixedPriceToDescription = ({
	price,
	currency,
	context,
}: {
	price: Price; // must be fixed price
	currency?: string;
	context: LineItemContext;
}): string => {
	const config = price.config as FixedPriceConfig;

	const { product } = context;

	// biome-ignore lint/correctness/noUnusedVariables: Might be used in the future
	const amount = formatAmount({ currency, amount: config.amount });

	let description = `${product.name} - Base Price`;

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
