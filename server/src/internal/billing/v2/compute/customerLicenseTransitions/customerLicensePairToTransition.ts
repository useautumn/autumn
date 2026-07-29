import {
	type CustomerLicenseTransition,
	customerLicenseToGranted,
	customerLicenseToUsage,
} from "@autumn/shared";
import type { CustomerLicensePair } from "./pairCustomerLicensesByLicensePlan.js";

/** Carries the outgoing pool's link and usage counters onto its paired successor. */
export const customerLicensePairToTransition = (
	pair: CustomerLicensePair,
): CustomerLicenseTransition => {
	const { outgoingCustomerLicense, incomingCustomerLicense } = pair;

	// 1. How many seats are used by the outgoing license...?
	const used = customerLicenseToUsage({
		customerLicense: outgoingCustomerLicense,
	});

	// 2. How many seats does the incoming license grant in total?
	const granted = customerLicenseToGranted({
		customerLicense: incomingCustomerLicense,
		planLicense: pair.incomingPlanLicense,
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
	};
};
