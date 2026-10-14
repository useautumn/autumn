import type { UsageWindowRoll } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

export const rollUsageWindowsCache = async ({
	ctx,
	customerId,
	rolls,
	now,
}: {
	ctx: AutumnContext;
	customerId: string;
	rolls: UsageWindowRoll[];
	now: number;
}): Promise<void> => {
	if (rolls.length === 0) return;

	try {
		const { org, env, redisV2 } = ctx;

		const rollsByFeatureId: Record<string, UsageWindowRoll[]> = {};
		for (const roll of rolls) {
			const featureRolls = rollsByFeatureId[roll.feature_id] ?? [];
			featureRolls.push(roll);
			rollsByFeatureId[roll.feature_id] = featureRolls;
		}

		const pipeline = redisV2.pipeline();
		for (const [featureId, featureRolls] of Object.entries(rollsByFeatureId)) {
			const balanceKey = buildSharedFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				featureId,
			});
			pipeline.rollUsageWindows(
				balanceKey,
				JSON.stringify({
					now,
					ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					rolls: featureRolls,
				}),
			);
		}

		await tryRedisWrite(() => pipeline.exec(), redisV2);
	} catch (error) {
		ctx.logger.error(
			`[rollUsageWindowsCache] customer=${customerId}, failed: ${error}`,
		);
	}
};
