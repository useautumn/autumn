import {
	type FullSubject,
	fullSubjectHasUsageBasedAllocated,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/** Deduction options with all defaults resolved (no optional fields) */
type ResolvedDeductionOptions = Required<
	Omit<DeductionOptions, "customerEntitlementFilters">
> & {
	customerEntitlementFilters: DeductionOptions["customerEntitlementFilters"];
};

/**
 * Prepares deduction options with defaults and paidAllocated overrides.
 * FullSubject version of prepareDeductionOptions.
 */
export const prepareDeductionOptionsV2 = ({
	ctx,
	fullSubject,
	options = {},
	deductions,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	options?: DeductionOptions;
	deductions: FeatureDeduction[];
}): ResolvedDeductionOptions => {
	const isPaidAllocated = fullSubjectHasUsageBasedAllocated({
		fullSubject,
		features: deductions.map((d) => d.feature),
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});

	return {
		overageBehaviour: isPaidAllocated
			? "reject"
			: (options.overageBehaviour ?? "cap"),
		skipAdditionalBalance: true,
		alterGrantedBalance: options.alterGrantedBalance ?? false,
		customerEntitlementFilters: options.customerEntitlementFilters,
		paidAllocated: isPaidAllocated,
		triggerAutoTopUp: options.triggerAutoTopUp ?? false,
	};
};
