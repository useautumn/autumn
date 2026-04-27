import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { getEntityAggregateForSync } from "@/internal/customers/repos/getFullSubject/getEntityAggregateForSync.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * After DB sync, recompute entity aggregation from the now-authoritative DB
 * and HSET `_aggregated` on the affected balance hashes.
 */
export const refreshEntityAggregateCache = async ({
	ctx,
	customerId,
	internalFeatureIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalFeatureIds: string[];
}): Promise<void> => {
	try {
		const orgId = ctx.org.id;
		const env = ctx.env;
		const internalIdSet = new Set(internalFeatureIds);
		const featureIds = ctx.features
			.filter((feature) => internalIdSet.has(feature.internal_id))
			.map((feature) => feature.id);

		if (featureIds.length === 0) return;

		const { redisV2 } = ctx;

		// Only refresh features whose balance hash already has `_aggregated`.
		// If none of the hashes have it cached, there is nothing to refresh —
		// avoid the expensive CTE entirely.
		const existsPipeline = redisV2.pipeline();
		for (const featureId of featureIds) {
			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId,
				env,
				customerId,
				featureId,
			});
			existsPipeline.hexists(balanceKey, AGGREGATED_BALANCE_FIELD);
		}
		const existsResults = (await existsPipeline.exec()) ?? [];
		const featuresWithAggregated = new Set<string>();
		existsResults.forEach(([, exists], idx) => {
			if (exists === 1) featuresWithAggregated.add(featureIds[idx]);
		});

		if (featuresWithAggregated.size === 0) {
			ctx.logger.info(
				`[SYNC V4] (${customerId}) No _aggregated fields cached — skipping refresh`,
			);
			return;
		}

		const aggregated = await getEntityAggregateForSync({
			db: ctx.db,
			orgId,
			env,
			customerId,
			internalFeatureIds,
		});

		if (aggregated.length === 0) return;

		const pipeline = redisV2.pipeline();
		let writeCount = 0;

		for (const entry of aggregated) {
			if (!featuresWithAggregated.has(entry.feature_id)) continue;

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
