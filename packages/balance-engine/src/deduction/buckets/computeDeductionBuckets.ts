import type { LeanCustomerEntitlement } from "../../common/types/customerState/customerStateTypes.js";
import type { DeductionBucket } from "../types/deductionBucket.js";

// All deduction policy lives here, as data. The apply fold never branches on
// overage behavior: cap and reject drain included balance only, overflow adds
// one unclamped sink on the last entitlement.
export const computeDeductionBuckets = ({
	customerEntitlements,
	overageBehavior,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	overageBehavior: "cap" | "reject" | "overflow";
}): DeductionBucket[] => {
	const includedBuckets = customerEntitlements.map(
		(customerEntitlement): DeductionBucket => ({
			customerEntitlement,
			kind: "spend_included",
			limit: 0,
		}),
	);

	const overflowSink = customerEntitlements.at(-1);
	if (overageBehavior !== "overflow" || !overflowSink) return includedBuckets;

	return [
		...includedBuckets,
		{ customerEntitlement: overflowSink, kind: "spend_overage", limit: null },
	];
};
