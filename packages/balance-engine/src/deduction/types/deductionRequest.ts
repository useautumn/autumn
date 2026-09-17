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
	/** The event's properties; filtered caps and dimensioned rates read them. */
	properties: Record<string, JsonValue> | null;
	/** Checks honour the org's overdue block; tracks only the threshold-billing one. */
	enforceOverdueBlock: boolean;
	now: number;
	org: CommandOrg;
};
