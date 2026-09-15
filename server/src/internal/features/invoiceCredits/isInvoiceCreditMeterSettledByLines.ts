import { isFixedPrice, type Price } from "@autumn/shared";
import {
	isInvoiceCreditCustomerEntitlement,
	type StampedCustomerEntitlement,
} from "./isInvoiceCreditCustomerEntitlement.js";

/**
 * Source debits settle an itemized credit balance through custom invoice lines, so its
 * Stripe meter is dropped unless it is the only item supplying the renewal cadence.
 */
export const isInvoiceCreditMeterSettledByLines = ({
	price,
	customerEntitlement,
	candidatePrices,
}: {
	price: Price;
	customerEntitlement?: StampedCustomerEntitlement | null;
	candidatePrices: Price[];
}): boolean => {
	if (!isInvoiceCreditCustomerEntitlement({ customerEntitlement }))
		return false;
	const creditConfig = price.config;
	return candidatePrices.some(
		(candidate) =>
			isFixedPrice(candidate) &&
			candidate.config.interval === creditConfig.interval &&
			(candidate.config.interval_count ?? 1) ===
				(creditConfig.interval_count ?? 1),
	);
};
