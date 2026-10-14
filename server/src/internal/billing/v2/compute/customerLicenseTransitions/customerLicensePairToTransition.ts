import {
	type CustomerLicenseTransition,
	customerLicenseToGranted,
	customerLicenseToUsage,
} from "@autumn/shared";
import type { CustomerLicensePair } from "./pairCustomerLicensesByLicensePlan.js";

export const customerLicensePairToTransition = (
	pair: CustomerLicensePair,
): CustomerLicenseTransition => {
	const { outgoingCustomerLicense, incomingCustomerLicense } = pair;

	const used = customerLicenseToUsage({
		customerLicense: outgoingCustomerLicense,
	});

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
