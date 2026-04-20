import type { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { getEntityAggregateForSync } from "@/internal/customers/repos/getFullSubject/getEntityAggregateForSync.js";

/**
 * After DB sync, recompute entity aggregation from the now-authoritative DB
 * and HSET `_aggregated` on the affected balance hashes.
 */
export const refreshEntityAggregateCache = async ({
	ctx,
	customerId,
	orgId,
	env,
	featureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	orgId: string;
	env: AppEnv;
	featureIds: string[];
}): Promise<void> => {
	try {
		const aggregated = await getEntityAggregateForSync({
			db: ctx.db,
			orgId,
			env,
			customerId,
		});

		if (aggregated.length === 0) return;

		const affectedFeatureIds = new Set(featureIds);
		const { redisV2 } = ctx;
		const pipeline = redisV2.pipeline();
		let writeCount = 0;

		for (const entry of aggregated) {
			if (!affectedFeatureIds.has(entry.feature_id)) continue;

			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				featureId: entry.feature_id,
			});
			pipeline.hset(
				balanceKey,
				AGGREGATED_BALANCE_FIELD,
				JSON.stringify(entry),
			);
			writeCount++;
		}

		if (writeCount > 0) {
			await tryRedisWrite(() => pipeline.exec(), redisV2);
			ctx.logger.info(
				`[SYNC V4] (${customerId}) Refreshed _aggregated for ${writeCount} features`,
			);
		}
	} catch (error) {
		ctx.logger.warn(
			`[SYNC V4] (${customerId}) Failed to refresh entity aggregation: ${error}`,
		);
	}
};
