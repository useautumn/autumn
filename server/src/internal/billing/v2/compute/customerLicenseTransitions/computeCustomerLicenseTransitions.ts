import type {
	CustomerLicenseBillingContext,
	CustomerLicenseTransition,
	FullCusProduct,
} from "@autumn/shared";
import { pairCustomerProducts } from "../pairCustomerProducts.js";
import { applyCustomerLicenseTransitions } from "./applyCustomerLicenseTransitions.js";
import { customerLicensePairToTransition } from "./customerLicensePairToTransition.js";
import { pairCustomerLicensesByLicensePlan } from "./pairCustomerLicensesByLicensePlan.js";

/** A successor row already matching what it would adopt (same-product
 * updates) produces nothing to write — dropped so callers can wire
 * unconditionally. */
const isNoopTransition = (transition: CustomerLicenseTransition): boolean => {
	const { outgoingCustomerLicense, incomingCustomerLicense, updates } =
		transition;
	return (
		transition.priceTransitions.length === 0 &&
		transition.entitlementTransitions.length === 0 &&
		outgoingCustomerLicense.plan_license_id ===
			incomingCustomerLicense.plan_license_id &&
		updates.linkId === incomingCustomerLicense.link_id &&
		updates.granted === incomingCustomerLicense.granted &&
		updates.remaining === incomingCustomerLicense.remaining &&
		updates.paidQuantity === incomingCustomerLicense.paid_quantity
	);
};

/** Computes license transitions across customer product transitions.
 * Catalog edits do not call this, preserving assignment snapshots. */
export const computeCustomerLicenseTransitions = ({
	outgoingCustomerProducts,
	incomingCustomerProducts,
	customerLicenseBillingContext,
}: {
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
	customerLicenseBillingContext?: CustomerLicenseBillingContext;
}): CustomerLicenseTransition[] => {
	const customerLicenseTransitions: CustomerLicenseTransition[] = [];

	const customerProductPairs = pairCustomerProducts({
		outgoingCustomerProducts,
		incomingCustomerProducts,
	});

	for (const {
		outgoingCustomerProduct,
		incomingCustomerProduct,
	} of customerProductPairs) {
		const customerLicensePairs = pairCustomerLicensesByLicensePlan({
			outgoingCustomerProduct,
			incomingCustomerProduct,
		});

		for (const customerLicensePair of customerLicensePairs) {
			const transition = customerLicensePairToTransition(customerLicensePair);
			if (isNoopTransition(transition)) continue;

			customerLicenseTransitions.push(transition);
		}
	}

	// Always applied: successor rows are in-memory planted state, and every
	// downstream compute expects them converged.
	applyCustomerLicenseTransitions({
		customerProducts: incomingCustomerProducts,
		customerLicenseTransitions,
		customerLicenseBillingContext,
	});

	return customerLicenseTransitions;
};
