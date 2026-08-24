import type { CustomerEntitlementDeduction } from "./customerEntitlementDeduction.js";

// One customer entitlement's turn at one clamp. The two spend kinds are the
// script's pass 1/2 for a positive amount, the two refund kinds its mirror for a
// negative one, and `unlimited` is the unlimited leader's unclamped absorb.
export type DeductionBucketKind =
	| "spend_included"
	| "spend_overage"
	| "refund_overage"
	| "refund_included"
	| "unlimited";

export type DeductionBucket = {
	customerEntitlementDeduction: CustomerEntitlementDeduction;
	kind: DeductionBucketKind;
	// Floor (spend) or ceiling (refund) the balance may reach; null = none.
	limit: number | null;
};
