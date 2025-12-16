import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import type { Feature } from "../../../../models/featureModels/featureModels";
import type { Price } from "../../../../models/productModels/priceModels/priceModels";
import { isOneOffPrice } from "../../../productUtils/priceUtils/classifyPriceUtils";
import { featureUsageToDescription } from "./featureUsageToDescription";
import { lineItemToPeriodDescription } from "./lineItemToPeriodDescription";

export const usagePriceToLineDescription = ({
	price,
	feature,
	usage,
	context,
}: {
	price: Price;
	feature: Feature;
	usage: number;
	context: LineItemContext;
}): string => {
	const billingUnits = price.config.billing_units ?? 1;

	// 1. Get feature usage description (eg. "3 x 150 credits")
	const featureUsageDescription = featureUsageToDescription({
		feature,
		usage,
		billingUnits,
	});

	const { product } = context;
	let description = `${product.name} - ${featureUsageDescription}`;

	if (!isOneOffPrice(price)) {
		const periodDescription = lineItemToPeriodDescription({
			context,
		});

		description = `${description} (${periodDescription})`;
	}

	if (context.direction === "refund") {
		description = `Unused ${description}`;
	}

	// if (billingPeriod) {
	// 	description = `${description} (${billingPeriodToDescription(billingPeriod)})`;
	// }

	return description;
};
