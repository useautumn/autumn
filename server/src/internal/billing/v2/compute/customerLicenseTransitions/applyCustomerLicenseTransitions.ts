import type {
	CustomerLicenseBillingContext,
	CustomerLicenseTransition,
	FullCusProduct,
} from "@autumn/shared";
import { transitionLicenseBillingPriceRows } from "./transitionLicenseBillingPriceRows.js";

/**
 * In-memory twin of transition execution: each planted successor row adopts
 * the outgoing pool's link and carried counters, so downstream computes
 * (line items, final-state customer) read post-transition state directly.
 */
export const applyCustomerLicenseTransitions = ({
	customerProducts,
	customerLicenseTransitions,
	customerLicenseBillingContext,
}: {
	customerProducts: FullCusProduct[];
	customerLicenseTransitions: CustomerLicenseTransition[];
	customerLicenseBillingContext?: CustomerLicenseBillingContext;
}): void => {
	if (customerLicenseTransitions.length === 0) return;

	const transitionByIncomingId = new Map(
		customerLicenseTransitions.map((transition) => [
			transition.incomingCustomerLicense.id,
			transition,
		]),
	);

	for (const customerProduct of customerProducts) {
		for (const customerLicense of customerProduct.customer_licenses ?? []) {
			const transition = transitionByIncomingId.get(customerLicense.id);
			if (!transition) continue;

			customerLicense.link_id = transition.updates.linkId;
			customerLicense.granted = transition.updates.granted;
			customerLicense.remaining = transition.updates.remaining;
			customerLicense.paid_quantity = transition.updates.paidQuantity;
		}
	}

	if (!customerLicenseBillingContext) return;

	// Successor seat rows append; the outgoing rows stay untouched so refund
	// paths keep reading pristine persisted state.
	const persistedRows = [
		...customerLicenseBillingContext.licenseBillingPriceRows,
	];
	for (const customerLicenseTransition of customerLicenseTransitions) {
		customerLicenseBillingContext.licenseBillingPriceRows.push(
			...transitionLicenseBillingPriceRows({
				licenseBillingPriceRows: persistedRows,
				customerLicenseTransition,
			}),
		);
	}
};
