import type { DeductionUpdate } from "./deductionUpdate.js";
import type { MutationLogItem } from "./mutationLogItem.js";
import type { RolloverUpdate } from "./rolloverUpdate.js";

export interface LuaDeductionResult {
	updates: Record<string, DeductionUpdate>;
	rollover_updates: Record<string, RolloverUpdate>;
	mutation_logs: MutationLogItem[];
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
