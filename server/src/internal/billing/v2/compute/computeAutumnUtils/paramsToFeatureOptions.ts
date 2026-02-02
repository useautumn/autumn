import type {
	EntitlementWithFeature,
	FeatureOptions,
	Price,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { notNullish, roundUsageToNearestBillingUnit } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const paramsToFeatureOptions = ({
	params,
	price,
	entitlement,
}: {
	params: UpdateSubscriptionV0Params;
	price: Price;
	entitlement: EntitlementWithFeature;
}): FeatureOptions | undefined => {
	const feature = entitlement.feature;

	const options = params.options?.find(
		(option) => option.feature_id === feature.id,
	);

	const billingUnits = price.config.billing_units ?? 1;

	if (notNullish(options?.quantity)) {
		const quantityExcludingAllowance = new Decimal(options.quantity)
			.sub(entitlement.allowance ?? 0)
			.toNumber();

		const roundedQuantity = roundUsageToNearestBillingUnit({
			usage: quantityExcludingAllowance,
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
