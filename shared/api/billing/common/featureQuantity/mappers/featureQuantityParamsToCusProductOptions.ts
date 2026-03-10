import { roundUsageToNearestBillingUnit } from "@utils/billingUtils/usageUtils/roundUsageToNearestBillingUnit";
import { Decimal } from "decimal.js";
import type { FeatureQuantityParamsV0 } from "../featureQuantityParamsV0";

export const featureQuantityParamsToCusProductOptions = ({
	featureQuantityParams,
	internalFeatureId,
	allowance,
	billingUnits,
}: {
	featureQuantityParams: FeatureQuantityParamsV0;
	internalFeatureId?: string;
	allowance: number;
	billingUnits: number;
}) => {
	const quantity = featureQuantityParams.quantity ?? 0;
	const quantityExcludingAllowance = Math.max(
		0,
		new Decimal(quantity).sub(allowance).toNumber(),
	);

	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: quantityExcludingAllowance,
		billingUnits,
	});

	const quantityDividedByBillingUnits = new Decimal(roundedQuantity)
		.div(billingUnits)
		.toNumber();

	return {
		feature_id: featureQuantityParams.feature_id,
		internal_feature_id: internalFeatureId,
		quantity: quantityDividedByBillingUnits,
	};
};
