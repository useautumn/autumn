import type { Decimal } from "decimal.js";
import type { LeanCustomerEntitlement } from "../common/types/customerState/customerStateTypes.js";
import { applyDeductionBuckets } from "./buckets/applyDeductionBuckets.js";
import { computeDeductionBuckets } from "./buckets/computeDeductionBuckets.js";
import type { DeductionResult } from "./types/deductionResult.js";

// The whole deduction kernel: pure over the rows it is handed — no state, no
// clock, no schema parsing. Policy becomes buckets; buckets fold the value.
export const deductFromCustomerEntitlements = ({
	customerEntitlements,
	value,
	overageBehavior,
}: {
	customerEntitlements: LeanCustomerEntitlement[];
	value: Decimal;
	overageBehavior: "cap" | "reject" | "overflow";
}): DeductionResult => {
	const buckets = computeDeductionBuckets({
		customerEntitlements,
		overageBehavior,
	});

	return applyDeductionBuckets({ customerEntitlements, buckets, value });
};
