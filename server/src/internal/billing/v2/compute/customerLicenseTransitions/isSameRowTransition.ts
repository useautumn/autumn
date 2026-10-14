import type { CustomerLicenseTransition } from "@autumn/shared";

export const isSameRowTransition = (
	transition: CustomerLicenseTransition,
): boolean =>
	transition.outgoingCustomerLicense.id ===
	transition.incomingCustomerLicense.id;
