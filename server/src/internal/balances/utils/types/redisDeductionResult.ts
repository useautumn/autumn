import type { UsageWindow } from "@autumn/shared";
import type { DeductionUpdate } from "./deductionUpdate.js";
import type { MutationLogItem } from "./mutationLogItem.js";
import type { RolloverUpdate } from "./rolloverUpdate.js";
import type { UsageWindowMutation } from "./usageWindowMutation.js";

export interface LuaDeductionResult {
	updates: Record<string, DeductionUpdate>;
	rollover_updates: Record<string, RolloverUpdate>;
	modified_customer_entitlement_ids: string[];
	mutation_logs: MutationLogItem[];
	/** Post-deduction COUNTER ROWS per capped feature (usage amounts; mirrors
	 *  the usage_windows table) -- not the limits config, which goes IN via
	 *  usage_window_limits. Null when no usage windows were enforced. */
	usage_windows_by_feature_id?: Record<string, UsageWindow[]> | null;
	/** Per-window deltas applied by this deduction (sibling stream of
	 *  mutation_logs). */
	usage_window_mutations?: UsageWindowMutation[];
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
