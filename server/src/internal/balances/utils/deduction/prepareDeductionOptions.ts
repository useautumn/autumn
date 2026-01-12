import type { FullCustomer } from "@autumn/shared";
import { isPaidContinuousUse } from "@/internal/features/featureUtils.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/** Deduction options with all defaults resolved (no optional fields) */
export type ResolvedDeductionOptions = Required<
	Omit<DeductionOptions, "customerEntitlementFilters">
> & {
	customerEntitlementFilters: DeductionOptions["customerEntitlementFilters"];
};

/**
 * Prepares deduction options with defaults and isPaidAllocated overrides.
 * Returns a fully resolved options object.
 */
export const prepareDeductionOptions = ({
	options = {},
	fullCustomer,
	deductions,
}: {
	options?: DeductionOptions;
	fullCustomer: FullCustomer;
	deductions: FeatureDeduction[];
}): ResolvedDeductionOptions => {
	const isPaidAllocated = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus: fullCustomer,
		}),
	);

	return {
		overageBehaviour: isPaidAllocated
			? "reject"
			: (options.overageBehaviour ?? "cap"),
		skipAdditionalBalance: true, // not used today
		alterGrantedBalance: options.alterGrantedBalance ?? false,
		customerEntitlementFilters: options.customerEntitlementFilters,
		paidAllocated: isPaidAllocated,
	};
};
