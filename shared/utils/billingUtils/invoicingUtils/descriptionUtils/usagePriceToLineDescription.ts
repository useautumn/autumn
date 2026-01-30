import { InternalError } from "../../../../api/errors";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { featureUsageToDescription } from "./featureUsageToDescription";

export const usagePriceToLineDescription = ({
	usage,
	context,
}: {
	usage: number;
	context: LineItemContext;
}): string => {
	const { price, feature } = context;
	const billingUnits = price.config.billing_units ?? 1;

	if (!feature) {
		throw new InternalError({
			message: `[usagePriceToLineDescription] No feature found for line item context`,
		});
	}

	// Get feature usage description (eg. "3 x 150 credits")
	let description = featureUsageToDescription({
		feature,
		usage,
		billingUnits,
	});

	if (context.direction === "refund") {
		description = `Unused ${description}`;
	}

	return description;
};
