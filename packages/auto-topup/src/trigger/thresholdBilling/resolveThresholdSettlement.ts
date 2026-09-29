import {
	cusEntToCusPrice,
	cusEntToInvoiceOverage,
	type FullCustomerPrice,
	isPayPerUsePrice,
} from "@autumn/shared";
import { subjectToFeatureRows } from "../subjectToFeatureRows.js";
import type {
	AutoTopupChargeSource,
	AutoTopupCustomerEntitlement,
	AutoTopupCustomerProduct,
	AutoTopupSubject,
} from "../types/autoTopupSubject.js";
import {
	computeThresholdCharge,
	type ThresholdCharge,
} from "./computeThresholdCharge.js";
import { priceThresholdBilling } from "./priceThresholdBilling.js";

export type ThresholdSettlement<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> =
	| { kind: "not_threshold_billed" }
	| { kind: "nothing_to_settle" }
	| {
			kind: "settle";
			customerEntitlement: AutoTopupChargeSource<CE, CP>;
			customerProduct: CP & { customer_entitlements: CE[] };
			customerPrice: FullCustomerPrice;
			threshold: number;
			charge: ThresholdCharge;
	  };

/** The pay-per-use price carrying a threshold, with the threshold it declares. */
const thresholdPrice = (
	row: AutoTopupCustomerEntitlement & {
		customer_product: AutoTopupCustomerProduct;
	},
): { customerPrice: FullCustomerPrice; threshold: number } | undefined => {
	const customerPrice = cusEntToCusPrice({ cusEnt: row });
	if (!customerPrice || !isPayPerUsePrice({ price: customerPrice.price })) {
		return undefined;
	}
	const threshold = priceThresholdBilling({
		price: customerPrice.price,
	})?.threshold;
	if (threshold === undefined || threshold <= 0) return undefined;
	return { customerPrice, threshold };
};

export const resolveThresholdSettlement = <
	CE extends AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct,
>({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: AutoTopupSubject<CE, CP>;
	featureId: string;
	now: number;
}): ThresholdSettlement<CE, CP> => {
	let thresholdBilled = false;

	for (const row of subjectToFeatureRows({ fullSubject, featureId, now })) {
		if (!row.customer_product) continue;
		const source = row as AutoTopupChargeSource<CE, CP>;
		const resolved = thresholdPrice(source);
		if (!resolved) continue;

		const { customerPrice, threshold } = resolved;
		thresholdBilled = true;
		const charge = computeThresholdCharge({
			outstandingUnits: cusEntToInvoiceOverage({ cusEnt: row }),
			threshold,
		});
		if (!charge) continue;

		return {
			kind: "settle",
			customerEntitlement: source,
			customerProduct: source.customer_product,
			customerPrice,
			threshold,
			charge,
		};
	}

	return {
		kind: thresholdBilled ? "nothing_to_settle" : "not_threshold_billed",
	};
};
