import type {
	CustomerLicenseBillingContext,
	CustomerLicenseTransition,
	FullCusProduct,
} from "@autumn/shared";
import { transitionLicenseBillingPriceRows } from "./transitionLicenseBillingPriceRows.js";

/** Mirrors pool transitions in memory for downstream billing computation. */
export const applyCustomerLicenseTransitions = ({
	customerProductsToMutate,
	customerLicenseTransitions,
	customerLicenseBillingContext,
}: {
	customerProductsToMutate: FullCusProduct[];
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

	for (const customerProduct of customerProductsToMutate) {
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

	// Projected rows append so refund paths can keep reading persisted state.
	const persistedRows = [
		...customerLicenseBillingContext.licenseBillingPriceRows,
	];
	for (const customerLicenseTransition of customerLicenseTransitions) {
		const planLicenseId =
			customerLicenseTransition.incomingCustomerLicense.planLicense?.id;
		if (planLicenseId) {
			customerLicenseBillingContext.projectedPlanLicenseIds.add(planLicenseId);
		}
		customerLicenseBillingContext.licenseBillingPriceRows.push(
			...transitionLicenseBillingPriceRows({
				licenseBillingPriceRows: persistedRows,
				customerLicenseTransition,
				assignedSeatCount:
					customerLicenseBillingContext.assignedSeatCountByCustomerLicenseId.get(
						customerLicenseTransition.outgoingCustomerLicense.id,
					) ?? 0,
			}),
		);
	}
};
