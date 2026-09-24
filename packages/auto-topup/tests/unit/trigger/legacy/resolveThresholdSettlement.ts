/** Verbatim copy of the server function this package replaces; the parity tests run it beside the new one. */
import {
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerPrice,
	fullCustomerToCustomerEntitlements,
	isPayPerUsePrice,
} from "@autumn/shared";
import {
	computeThresholdCharge,
	type ThresholdCharge,
} from "./computeThresholdCharge.js";
import { priceThresholdBilling } from "./priceThresholdBilling.js";

export type ThresholdSettlement =
	| { kind: "not_threshold_billed" }
	| { kind: "nothing_to_settle" }
	| {
			kind: "settle";
			customerEntitlement: FullCusEntWithFullCusProduct;
			customerProduct: FullCusProduct;
			customerPrice: FullCustomerPrice;
			threshold: number;
			charge: ThresholdCharge;
	  };

/** The pay-per-use price carrying a threshold, with the threshold it declares. */
const thresholdPrice = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): { customerPrice: FullCustomerPrice; threshold: number } | undefined => {
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	if (!customerPrice || !isPayPerUsePrice({ price: customerPrice.price })) {
		return undefined;
	}

	const threshold = priceThresholdBilling({
		price: customerPrice.price,
	})?.threshold;
	if (threshold === undefined || threshold <= 0) return undefined;

	return { customerPrice, threshold };
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
		const customerProduct = customerEntitlement.customer_product;
		if (!customerProduct) continue;

		const resolved = thresholdPrice(customerEntitlement);
		if (!resolved) continue;

		const { customerPrice, threshold } = resolved;
		thresholdBilled = true;

		const charge = computeThresholdCharge({
			outstandingUnits: cusEntToInvoiceOverage({ cusEnt: customerEntitlement }),
			threshold,
		});
		if (!charge) continue;

		return {
			kind: "settle",
			customerEntitlement,
			customerProduct,
			customerPrice,
			threshold,
			charge,
		};
	}

	return {
		kind: thresholdBilled ? "nothing_to_settle" : "not_threshold_billed",
	};
};
