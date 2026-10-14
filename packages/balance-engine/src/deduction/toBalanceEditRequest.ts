import type { CustomerEntitlementFilters } from "@autumn/shared";
import type { CommandOrg } from "../models/command/commandOrg.js";
import { toDeductionSelection } from "./toDeductionSelection.js";
import type { DeductionRequest } from "./types/deductionRequest.js";

export const toBalanceEditRequest = ({
	featureId,
	internalFeatureId,
	value,
	includesCreditSystems,
	countsUsageWindows,
	customerEntitlementFilters,
	org,
	now,
}: {
	featureId: string;
	internalFeatureId: string;
	value: number;
	includesCreditSystems: boolean;
	countsUsageWindows: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;
	org: CommandOrg;
	now: number;
}): DeductionRequest => ({
	selection: toDeductionSelection({
		featureId,
		internalFeatureId,
		now,
		properties: null,
		includesCreditSystems,
		countsUsageWindows,
		countsAllocations: false,
		customerEntitlementFilters,
		org,
		enforceOverdueBlock: false,
	}),
	terms: { overageBehavior: "overflow", enforcesSpendLimit: false },
	value,
});
