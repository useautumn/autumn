import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { executeBatchDeduction } from "./executeBatchDeduction.js";

/**
 * Deducts from Redis cache to match Postgres deduction
 * Called after runDeductionTx to keep cache in sync
 *
 * Use case: After Postgres deduction completes, apply same deduction to Redis cache
 * - If cache doesn't exist, no-op (lazy population is fine)
 * - If cache exists, deducts the actual amount from Postgres
 * - Uses "cap" behavior since Postgres already validated the deduction
 */
export const deductFromCache = async ({
	ctx,
	customerId,
	featureId,
	amount,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
	amount: number;
	entityId?: string;
}): Promise<Record<string, number> | undefined> => {
	const { org, env } = ctx;

	// Execute Redis deduction directly (no batching to avoid race conditions)
	let featureDeductions: Record<string, number> | undefined;
	
	await tryRedisWrite(async () => {
		const result = await executeBatchDeduction({
			redis,
			requests: [
				{
					featureDeductions: [{ featureId, amount }],
					overageBehavior: "cap", // Cap since Postgres already handled validation
					entityId,
				},
			],
			orgId: org.id,
			env,
			customerId,
		});

		if (!result.success && result.error !== "CUSTOMER_NOT_FOUND") {
			ctx.logger.warn(
				`Failed to deduct from cache for ${customerId}, feature ${featureId}: ${result.error}`,
			);
		}
		
		// Capture feature deductions for return
		featureDeductions = result.featureDeductions;
	});
	
	return featureDeductions;
};

// Keep the old name for backward compatibility
export const syncCacheBalance = deductFromCache;
