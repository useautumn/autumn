import {
	cusEntToCusPrice,
	fullCustomerToCustomerEntitlements,
	isPayPerUsePrice,
	type Feature,
	type FullCustomer,
	type FullCusEntWithFullCusProduct,
	type UsagePriceConfig,
} from "@autumn/shared";

export type ThresholdBillingScope = {
	customerEntitlement: FullCusEntWithFullCusProduct;
	feature: Feature;
	threshold: number;
};

export const resolveThresholdBilling = ({
	fullCustomer,
	feature,
}: {
	fullCustomer: FullCustomer;
	feature: Feature;
}): ThresholdBillingScope | null => {
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId: feature.id,
	});

	for (const customerEntitlement of customerEntitlements) {
		const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
		if (!customerPrice || !isPayPerUsePrice({ price: customerPrice.price })) {
			continue;
		}

		const threshold = (customerPrice.price.config as UsagePriceConfig)
			.threshold_billing?.threshold;
		if (threshold === undefined) continue;

		return { customerEntitlement, feature, threshold };
	}

	return null;
};
