import type {
	Feature,
	FeatureOptions,
	Price,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { roundUsageToNearestBillingUnit } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const paramsToFeatureOptions = ({
	params,
	price,
	feature,
}: {
	params: UpdateSubscriptionV0Params;
	price: Price;
	feature: Feature;
}): FeatureOptions | undefined => {
	const options = params.options?.find(
		(option) => option.feature_id === feature.id,
	);

	const billingUnits = price.config.billing_units ?? 1;

	if (options?.quantity) {
		// 1. Round options quantity to nearest billing units:
		const roundedQuantity = roundUsageToNearestBillingUnit({
			usage: options.quantity,
			billingUnits,
		});

		const quantityDividedByBillingUnits = new Decimal(roundedQuantity)
			.div(billingUnits)
			.toNumber();

		return {
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			quantity: quantityDividedByBillingUnits,
		};
	}

	return undefined;
};
