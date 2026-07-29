import type { CustomerLicenseTransition } from "@autumn/shared";

/** Patch-path transition: outgoing and incoming are the SAME pool row, just
 * on different definitions — link and seats never move, only
 * plan_license_id, counters, and seat item refs converge. */
export const isSameRowTransition = (
	transition: CustomerLicenseTransition,
): boolean =>
	transition.outgoingCustomerLicense.id ===
	transition.incomingCustomerLicense.id;
