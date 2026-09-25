import type { CustomerEntitlementFilters } from "@autumn/shared";
import type { CommandOrg } from "../models/command/commandOrg.js";
import type { DeductionRequest } from "./types/deductionRequest.js";

/** An admin edit to a balance, not a customer's consumption: no floors, no spend limit, no overdue block, no event properties. */
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
	featureId,
	internalFeatureId,
	value,
	overageBehavior: "overflow",
	includesCreditSystems,
	enforcesSpendLimit: false,
	customerEntitlementFilters,
	countsUsageWindows,
	properties: null,
	enforceOverdueBlock: false,
	now,
	org,
});
