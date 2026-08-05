import { AppEnv } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Short by design: org config changes are also pushed through clearOrgCache, so
 *  this only has to bound the staleness window for anything that misses that. */
export const ORG_WITH_FEATURES_CACHE_TTL_SECONDS = 60;

export const buildOrgWithFeaturesCacheKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => `org_with_features:${orgId}:${env}`;

export const getCachedOrgWithFeatures = async <T>({
	orgId,
	env,
	requestId,
}: {
	orgId: string;
	env: AppEnv;
	requestId?: string;
}): Promise<T | null> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "org-features-cache:get",
		redisInstance: miscRedis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesGet,
	});

	if (!cached) return null;

	return JSON.parse(cached) as T;
};

export const setCachedOrgWithFeatures = async ({
	orgId,
	env,
	data,
	ttl = ORG_WITH_FEATURES_CACHE_TTL_SECONDS,
	requestId,
}: {
	orgId: string;
	env: AppEnv;
	data: unknown;
	ttl?: number;
	requestId?: string;
}) => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	await tryRedisOp({
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "org-features-cache:set",
		redisInstance: miscRedis,
	});
};

/** Drop the cached org on every live instance — ramped readers must never see
 *  stale org config. */
export const clearOrgWithFeaturesCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	/** Omit to clear every env. */
	env?: AppEnv;
}) => {
	const envs = env ? [env] : [AppEnv.Live, AppEnv.Sandbox];
	const cacheKeys = envs.map((targetEnv) =>
		buildOrgWithFeaturesCacheKey({ orgId, env: targetEnv }),
	);

	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () => redis.del(...cacheKeys),
				source: "org-features-cache:clear",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[orgWithFeaturesCache] clear failed on "${target.instanceName}" (org: ${orgId})`,
			);
		},
	});
};
