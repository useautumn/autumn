import {
	type CustomerEntitlementFilters,
	orgToInStatuses,
} from "@autumn/shared";
import type { CommandOrg } from "../models/command/commandOrg.js";
import type { JsonValue } from "../models/common/json.js";
import type { DeductionSelection } from "./types/deductionRequest.js";

/** The one place a request reads the org's deduction settings. */
export const toDeductionSelection = ({
	featureId,
	internalFeatureId,
	now,
	properties,
	includesCreditSystems,
	countsUsageWindows,
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
	customerEntitlementFilters?: CustomerEntitlementFilters;
	org: CommandOrg;
	/** Checks honour the org's overdue block; tracks only the threshold-billing one. */
	enforceOverdueBlock: boolean;
}): DeductionSelection => ({
	featureId,
	internalFeatureId,
	now,
	properties,
	includesCreditSystems,
	countsUsageWindows,
	customerEntitlementFilters,
	inStatuses: orgToInStatuses({ org }),
	reverseOrder: Boolean(org.config.reverse_deduction_order),
	blocksOverdue:
		enforceOverdueBlock && Boolean(org.config.block_overdue_entitlements),
});
