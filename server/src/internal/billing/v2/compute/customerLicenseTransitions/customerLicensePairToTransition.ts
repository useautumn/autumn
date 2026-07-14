import {
	type CustomerLicenseTransition,
	customerLicenseToGranted,
	customerLicenseToUsed,
} from "@autumn/shared";
import { matchItemSuccessors } from "./matchItemSuccessors.js";
import type { CustomerLicensePair } from "./pairCustomerLicensesByLicensePlan.js";

/**
 * The full transition for one paired customer license: the planted successor
 * row adopts the outgoing pool's link (seats stay anchored to it) with
 * carried counters, and seats repoint onto the successor prices/entitlements
 * where the definitions drifted.
 */
export const customerLicensePairToTransition = (
	pair: CustomerLicensePair,
): CustomerLicenseTransition => {
	const { outgoingCustomerLicense, incomingCustomerLicense } = pair;

	// 1. How many seats are used by the outgoing license...?
	const used = customerLicenseToUsed({
		customerLicense: outgoingCustomerLicense,
	});

	// 2. How many seats does the incoming license grant in total?
	const granted = customerLicenseToGranted({
		customerLicense: incomingCustomerLicense,
		planLicense: pair.incomingPlanLicense,
	});

	// 3. Where has the license definition drifted? Seats repoint per item.
	const { priceTransitions, entitlementTransitions } = matchItemSuccessors({
		fromProduct: pair.outgoingPlanLicense.product,
		toProduct: pair.incomingPlanLicense.product,
	});

	return {
		outgoingCustomerLicense,
		incomingCustomerLicense,
		updates: {
			linkId: outgoingCustomerLicense.link_id,
			granted,
			remaining: granted - used,
			paidQuantity: incomingCustomerLicense.paid_quantity,
		},
		priceTransitions,
		entitlementTransitions,
	};
};
