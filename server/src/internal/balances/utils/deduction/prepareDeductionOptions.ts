import type { FullCustomer } from "@autumn/shared";
import { isPaidContinuousUse } from "@/internal/features/featureUtils.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/** Deduction options with all defaults resolved (no optional fields) */
type ResolvedDeductionOptions = Required<
	Omit<DeductionOptions, "customerEntitlementFilters">
> & {
	customerEntitlementFilters: DeductionOptions["customerEntitlementFilters"];
};

/**
 * Prepares deduction options with defaults and paidAllocatedV1 overrides.
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
	const isPaidAllocatedV1 = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus: fullCustomer,
		}),
	);

	return {
		overageBehaviour: isPaidAllocatedV1
			? "reject"
			: (options.overageBehaviour ?? "cap"),
		skipAdditionalBalance: true, // not used today
		alterGrantedBalance: options.alterGrantedBalance ?? false,
		customerEntitlementFilters: options.customerEntitlementFilters,
		paidAllocatedV1: isPaidAllocatedV1,

		triggerAutoTopUp: options.triggerAutoTopUp ?? false,
		triggerSideEffects: options.triggerSideEffects ?? true,
	};
};
