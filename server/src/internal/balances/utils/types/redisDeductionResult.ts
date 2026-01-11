import type { DeductionUpdate } from "./deductionUpdate.js";

export interface LuaDeductionResult {
	updates: Record<string, DeductionUpdate>;
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
