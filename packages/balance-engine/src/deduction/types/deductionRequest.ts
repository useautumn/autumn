import type {
	CusProductStatus,
	CustomerEntitlementFilters,
} from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { JsonValue } from "../../models/common/json.js";

export type DeductionSelection = {
	featureId: string;
	internalFeatureId: string;
	now: number;
	properties: Record<string, JsonValue> | null;
	includesCreditSystems: boolean;
	countsUsageWindows: boolean;
	countsAllocations: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;
	inStatuses: CusProductStatus[];
	reverseOrder: boolean;
	blocksOverdue: boolean;
};

export type DeductionTerms = {
	overageBehavior: OverageBehavior;
	enforcesSpendLimit: boolean;
};

export type DeductionRequest = {
	selection: DeductionSelection;
	terms: DeductionTerms;
	value: number;
};
