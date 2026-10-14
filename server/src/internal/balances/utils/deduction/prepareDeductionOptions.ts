import type { FullCustomer } from "@autumn/shared";
import { isPaidContinuousUse } from "@/internal/features/featureUtils.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

type ResolvedDeductionOptions = Required<
	Omit<DeductionOptions, "customerEntitlementFilters" | "eventProperties">
> & {
	customerEntitlementFilters: DeductionOptions["customerEntitlementFilters"];
	eventProperties: DeductionOptions["eventProperties"];
};

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
		skipAdditionalBalance: true,
		alterGrantedBalance: options.alterGrantedBalance ?? false,
		countsAllocations: options.countsAllocations ?? false,
		customerEntitlementFilters: options.customerEntitlementFilters,
		eventProperties: options.eventProperties,
		paidAllocatedV1: isPaidAllocatedV1,

		triggerAutoTopUp: options.triggerAutoTopUp ?? false,
	};
};
