import type { EntityRolloverBalance } from "@autumn/shared";
import type { DeductionUpdate } from "./deductionUpdate.js";

export interface RolloverUpdate {
	balance: number;
	usage: number;
	entities: Record<string, EntityRolloverBalance>;
}

export interface LuaDeductionResult {
	updates: Record<string, DeductionUpdate>;
	rollover_updates: Record<string, RolloverUpdate>;
	remaining: number;
	error?: string;
	feature_id?: string;
	logs?: string[];
}
