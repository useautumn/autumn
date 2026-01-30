import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import type { FixedPriceConfig } from "../../../../models/productModels/priceModels/priceConfig/fixedPriceConfig";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { formatAmount } from "../../../common/formatUtils/formatAmount";

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

	// biome-ignore lint/correctness/noUnusedVariables: Might be used in the future
	const amount = formatAmount({ currency, amount: config.amount });

	let description = "Base Price";

	if (context.direction === "refund") {
		description = `Unused ${description}`;
	}

	return description;
};
