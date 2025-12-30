import type { ApiBalance } from "@autumn/shared";
import type { Redis } from "ioredis";
import { logger } from "../../../../external/logtail/logtailUtils";

interface FeatureDeduction {
	featureId: string;
	amount: number;
}

export interface BatchRequestFilters {
	id?: string; // Match breakdown.id (customer_entitlement_id)
	interval?: string; // Match breakdown.reset.interval (e.g., "month", "week")
}

interface BatchRequest {
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject" | "allow";
	syncMode?: boolean; // If true, sync cache to target balance instead of deducting
	targetBalance?: number; // Target balance for sync mode (per feature)
	entityId?: string;
	filters?: BatchRequestFilters; // Filter which breakdown items to consider
}

interface RequestResult {
	success: boolean;
	error?: string;
}

interface BatchDeductionResult {
	success: boolean;
	results: RequestResult[];
	error?: string;
	customerChanged?: boolean; // True if customer-level features were modified
	changedEntityIds?: string[]; // Array of entity IDs that were modified
	balances?: Record<string, ApiBalance>; // Object of changed balances keyed by featureId
	featureDeductions?: Record<string, number>; // Actual amounts deducted per feature
	modifiedBreakdownIds?: string[]; // Array of breakdown.id (customer_entitlement_id) values that were modified
	debug?: unknown; // For debugging purposes
}

/**
 * Execute batch deduction Lua script
 * Processes multiple track requests atomically in a single Redis call
 * Each request can deduct from multiple features
 */
export const executeBatchDeduction = async ({
	redis,
	requests,
	orgId,
	env,
	customerId,
	adjustGrantedBalance = false,
}: {
	redis: Redis;
	requests: BatchRequest[];
	orgId: string;
	env: string;
	customerId: string;
	adjustGrantedBalance?: boolean;
}): Promise<BatchDeductionResult> => {
	try {
		// Execute Lua script (hot reload in dev)
		const result = await redis.batchDeduction(
			JSON.stringify(requests), // ARGV[1]
			orgId, // ARGV[2]
			env, // ARGV[3]
			customerId, // ARGV[4]
			adjustGrantedBalance ? "true" : "false", // ARGV[5]
		);

		// Parse result
		const parsed = JSON.parse(result as string) as BatchDeductionResult;

		// Log debug info if present
		if (parsed.debug) {
			console.log("🔍 Lua debug info:", JSON.stringify(parsed.debug, null, 2));
		}

		// // Log actual feature deductions
		// if (
		// 	parsed.featureDeductions &&
		// 	Object.keys(parsed.featureDeductions).length > 0
		// ) {
		// 	console.log(
		// 		"✅ Feature deductions from Redis:",
		// 		parsed.featureDeductions,
		// 	);
		// }

		return parsed;
	} catch (error) {
		console.error("Error executing batch deduction:", error);

		logger.error(`Error executing batch deduction: ${error}`, {
			data: {
				orgId,
				env,
				customerId,
				requests,
			},
			error: {
				message: error instanceof Error ? error.message : "UNKNOWN_ERROR",
			},
		});
		return {
			success: false,
			results: [],
			error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
		};
	}
};
