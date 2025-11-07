import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { buildCachedApiCustomerKey } from "../../../customers/cusUtils/apiCusCacheUtils/getCachedApiCustomer.js";
import { executeBatchDeduction } from "./executeBatchDeduction.js";

/**
 * Syncs Redis cache balance to match Postgres balance after a deduction transaction
 * Uses sync mode in batchDeduction.lua to calculate delta and apply it
 *
 * Use case: After runDeductionTx completes, sync cache to prevent stale data
 * - If cache doesn't exist, no-op (lazy population is fine)
 * - If cache exists, calculates delta between current cache and target balance
 * - Applies delta to bring cache in sync with Postgres
 */
export const syncCacheBalance = async ({
	ctx,
	customerId,
	featureId,
	targetBalance,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureId: string;
	targetBalance: number;
	entityId?: string;
}): Promise<void> => {
	const { org, env } = ctx;

	const cacheKey = buildCachedApiCustomerKey({
		customerId,
		orgId: org.id,
		env,
	});

	// Execute Redis sync call directly (no batching)
	await tryRedisWrite(async () => {
		const result = await executeBatchDeduction({
			redis,
			cacheKey,
			requests: [
				{
					featureDeductions: [
						{
							featureId,
							amount: 0, // Will be calculated in Lua based on targetBalance
						},
					],
					overageBehavior: "cap",
					syncMode: true,
					targetBalance,
					entityId,
				},
			],
			orgId: org.id,
			env,
			customerId,
		});

		if (!result.success && result.error !== "CUSTOMER_NOT_FOUND") {
			ctx.logger.warn(
				`Failed to sync cache balance for ${customerId}, feature ${featureId}: ${result.error}`,
			);
		}
	});
};
