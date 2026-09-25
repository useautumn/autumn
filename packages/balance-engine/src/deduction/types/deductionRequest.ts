import type { CustomerEntitlementFilters } from "@autumn/shared";
import type { OverageBehavior } from "../../commands/track/types/trackCommand.js";
import type { CommandOrg } from "../../models/command/commandOrg.js";
import type { JsonValue } from "../../models/common/json.js";

/** What a command asks the deduction for, in one object that passes through setup untouched. */
export type DeductionRequest = {
	featureId: string;
	/** The feature's catalog internal id; credit usage is attributed under it. */
	internalFeatureId: string;
	/** Units of the feature; negative refunds. */
	value: number;
	overageBehavior: OverageBehavior;
	/** Credit systems that fund the feature are drawn after its own rows; off, only the feature's own rows are. */
	includesCreditSystems: boolean;
	/** Off lets overage run past the spend limit: a balance set to a target must land on it. */
	enforcesSpendLimit: boolean;
	/** Narrows the selected rows to one balance, entitlement or interval. */
	customerEntitlementFilters?: CustomerEntitlementFilters;
	/** Consumption checks and counts windowed caps; a balance set to a target does neither. */
	countsUsageWindows: boolean;
	/** The event's properties; filtered caps and dimensioned rates read them. */
	properties: Record<string, JsonValue> | null;
	/** Checks honour the org's overdue block; tracks only the threshold-billing one. */
	enforceOverdueBlock: boolean;
	now: number;
	org: CommandOrg;
};
