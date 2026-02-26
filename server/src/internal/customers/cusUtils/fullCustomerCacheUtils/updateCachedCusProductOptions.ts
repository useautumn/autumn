import type { RepoContext } from "@/db/repoContext.js";
import { redis } from "@/external/redis/initRedis.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { buildFullCustomerCacheKey } from "./fullCustomerCacheConfig.js";

type UpdateCachedCusProductOptionsResult = {
	ok: boolean;
	newQuantity?: number;
};

/**
 * Atomically increments a cusProduct's options[].quantity in the Redis
 * FullCustomer cache via JSON.NUMINCRBY. Matches by internal_feature_id or feature_id.
 */
export const updateCachedCusProductOptions = async ({
	ctx,
	customerId,
	internalFeatureId,
	featureId,
	delta,
}: {
	ctx: RepoContext;
	customerId: string;
	internalFeatureId?: string;
	featureId?: string;
	delta: number;
}): Promise<UpdateCachedCusProductOptionsResult | null> => {
	try {
		const { org, env, logger } = ctx;

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const result = await tryRedisWrite(async () => {
			return await redis.updateCusProductOptions(
				cacheKey,
				JSON.stringify({
					internal_feature_id: internalFeatureId,
					feature_id: featureId,
					delta,
				}),
			);
		});

		if (result === null) {
			logger.warn(
				`[updateCachedCusProductOptions] Redis write failed for feature ${featureId || internalFeatureId}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			ok: boolean;
			new_quantity?: number;
			error?: string;
		};

		if (!parsed.ok) {
			logger.warn(
				`[updateCachedCusProductOptions] Lua script error for feature ${featureId || internalFeatureId}: ${parsed.error}`,
			);
		}

		return {
			ok: parsed.ok,
			newQuantity: parsed.new_quantity,
		};
	} catch (error) {
		ctx.logger.error(
			`[updateCachedCusProductOptions] feature ${featureId || internalFeatureId}: error, ${error}`,
		);
		return null;
	}
};
