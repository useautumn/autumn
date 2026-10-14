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
	usage_windows_by_feature_id?: Record<string, UsageWindow[]> | null;
	usage_window_mutations?: UsageWindowMutation[];
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
