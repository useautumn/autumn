import type { DeductionUpdate } from "./deductionTypes.js";

export interface LuaDeductionResult {
	updates: Record<string, DeductionUpdate>;
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
