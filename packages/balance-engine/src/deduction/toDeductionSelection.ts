import {
	type CustomerEntitlementFilters,
	orgToInStatuses,
} from "@autumn/shared";
import type { CommandOrg } from "../models/command/commandOrg.js";
import type { JsonValue } from "../models/common/json.js";
import type { DeductionSelection } from "./types/deductionRequest.js";

export const toDeductionSelection = ({
	featureId,
	internalFeatureId,
	now,
	properties,
	includesCreditSystems,
	countsUsageWindows,
	countsAllocations,
	customerEntitlementFilters,
	org,
	enforceOverdueBlock,
}: {
	featureId: string;
	internalFeatureId: string;
	now: number;
	properties: Record<string, JsonValue> | null;
	includesCreditSystems: boolean;
	countsUsageWindows: boolean;
	countsAllocations: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;
	org: CommandOrg;
	enforceOverdueBlock: boolean;
}): DeductionSelection => ({
	featureId,
	internalFeatureId,
	now,
	properties,
	includesCreditSystems,
	countsUsageWindows,
	countsAllocations,
	customerEntitlementFilters,
	inStatuses: orgToInStatuses({ org }),
	reverseOrder: Boolean(org.config.reverse_deduction_order),
	blocksOverdue:
		enforceOverdueBlock && Boolean(org.config.block_overdue_entitlements),
});
