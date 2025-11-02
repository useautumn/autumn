import type { Redis } from "ioredis";
import { BATCH_DEDUCTION_SCRIPT } from "./luaScripts.js";

interface BatchDeductionResult {
	success: boolean;
	successCount: number;
	error?: string;
}

/**
 * Execute batch deduction Lua script
 * Processes multiple deductions atomically in a single Redis call
 * Supports credit system features as alternative payment sources
 */
export const executeBatchDeduction = async ({
	redis,
	cacheKey,
	targetFeatureId,
	amounts,
}: {
	redis: Redis;
	cacheKey: string;
	targetFeatureId: string; // The feature we're trying to deduct from
	amounts: number[];
}): Promise<BatchDeductionResult> => {
	try {
		// Execute Lua script
		const result = await redis.eval(
			BATCH_DEDUCTION_SCRIPT,
			2, // number of keys
			cacheKey, // KEYS[1]
			targetFeatureId, // KEYS[2] - target feature ID
			JSON.stringify(amounts), // ARGV[1]
		);

		// Parse result
		const parsed = JSON.parse(result as string) as BatchDeductionResult;
		return parsed;
	} catch (error) {
		console.error("Error executing batch deduction:", error);
		return {
			success: false,
			successCount: 0,
			error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
		};
	}
};
