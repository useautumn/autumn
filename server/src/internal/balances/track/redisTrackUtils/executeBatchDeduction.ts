import type { Redis } from "ioredis";
import { getBatchDeductionScript } from "./luaScripts.js";

interface FeatureDeduction {
	featureId: string;
	amount: number;
}

interface BatchRequest {
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject";
	syncMode?: boolean; // If true, sync cache to target balance instead of deducting
	targetBalance?: number; // Target balance for sync mode (per feature)
	entityId?: string;
}

interface RequestResult {
	success: boolean;
	error?: string;
}

interface BatchDeductionResult {
	success: boolean;
	results: RequestResult[];
	error?: string;
	debug?: any; // For debugging purposes
}

/**
 * Execute batch deduction Lua script
 * Processes multiple track requests atomically in a single Redis call
 * Each request can deduct from multiple features
 */
export const executeBatchDeduction = async ({
	redis,
	cacheKey,
	requests,
	orgId,
	env,
	customerId,
}: {
	redis: Redis;
	cacheKey: string;
	requests: BatchRequest[];
	orgId: string;
	env: string;
	customerId: string;
}): Promise<BatchDeductionResult> => {
	try {
		// Execute Lua script (hot reload in dev)
		const result = await redis.eval(
			getBatchDeductionScript(),
			1, // number of keys
			cacheKey, // KEYS[1]
			JSON.stringify(requests), // ARGV[1]
			orgId, // ARGV[2]
			env, // ARGV[3]
			customerId, // ARGV[4]
		);

		// Parse result
		const parsed = JSON.parse(result as string) as BatchDeductionResult;

		// Log debug info if present
		if (parsed.debug) {
			console.log("🔍 Lua debug info:", JSON.stringify(parsed.debug, null, 2));
		}

		return parsed;
	} catch (error) {
		console.error("Error executing batch deduction:", error);
		return {
			success: false,
			results: [],
			error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
		};
	}
};
