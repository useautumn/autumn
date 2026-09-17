import {
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isPayPerUsePrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	computeThresholdCharge,
	type ThresholdCharge,
} from "../compute/computeThresholdCharge.js";

export type ThresholdSettlement =
	| { kind: "not_threshold_billed" }
	| { kind: "nothing_to_settle" }
	| {
			kind: "settle";
			customerEntitlement: FullCusEntWithFullCusProduct;
			threshold: number;
			charge: ThresholdCharge;
	  };

const entitlementThreshold = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): number | undefined => {
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	if (!customerPrice || !isPayPerUsePrice({ price: customerPrice.price })) {
		return undefined;
	}

	return (customerPrice.price.config as UsagePriceConfig).threshold_billing
		?.threshold;
};

export const resolveThresholdSettlement = ({
	fullCustomer,
	featureId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
}): ThresholdSettlement => {
	const customerEntitlements = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	let thresholdBilled = false;

	for (const customerEntitlement of customerEntitlements) {
		if (!customerEntitlement.customer_product) continue;

		const threshold = entitlementThreshold(customerEntitlement);
		if (threshold === undefined || threshold <= 0) continue;

		thresholdBilled = true;

		const charge = computeThresholdCharge({
			outstandingUnits: cusEntToInvoiceOverage({ cusEnt: customerEntitlement }),
			threshold,
		});
		if (!charge) continue;

		return { kind: "settle", customerEntitlement, threshold, charge };
	}

	return {
		kind: thresholdBilled ? "nothing_to_settle" : "not_threshold_billed",
	};
};
