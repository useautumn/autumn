import { AppEnv } from "@autumn/shared";
import { LRUCache } from "lru-cache";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { REDIS_OP_TIMEOUT_MS } from "@/external/redis/utils/redisOpTimeouts.js";
import { runRedisOp, tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Short by design: org config changes are also pushed through clearOrgCache, so
 *  this only has to bound the staleness window for anything that misses that. */
export const ORG_WITH_FEATURES_CACHE_TTL_SECONDS = 60;

// This TTL is the invalidation window: clearOrgWithFeaturesCache only reaches
// the calling process's L1, so every other worker serves stale org config until
// it lapses. Kept well under the 60s Redis TTL for that reason.
export const ORG_WITH_FEATURES_L1_TTL_MS = 5_000;
/** An org payload carries every feature, so this is bounded far tighter than the
 *  secret-key L1 — it holds the handful of orgs a worker process is hot on. */
export const ORG_WITH_FEATURES_L1_MAX_ENTRIES = 500;

type OrgWithFeaturesL1Entry = { value: unknown };

/** Per-process L1. Each cluster worker gets its own copy — intended. */
const orgWithFeaturesL1 = new LRUCache<string, OrgWithFeaturesL1Entry>({
	max: ORG_WITH_FEATURES_L1_MAX_ENTRIES,
	ttl: ORG_WITH_FEATURES_L1_TTL_MS,
});

export const _resetOrgWithFeaturesL1ForTesting = () =>
	orgWithFeaturesL1.clear();
export const _orgWithFeaturesL1SizeForTesting = () => orgWithFeaturesL1.size;

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

	const local = orgWithFeaturesL1.get(cacheKey);
	if (local) return local.value as T;

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "org-features-cache:get",
		redisInstance: miscRedis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesGet,
	});

	if (!cached) return null;

	const parsed = JSON.parse(cached) as T;
	orgWithFeaturesL1.set(cacheKey, { value: parsed });
	return parsed;
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

	orgWithFeaturesL1.set(cacheKey, { value: data });

	await tryRedisOp({
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "org-features-cache:set",
		redisInstance: miscRedis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesSet,
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

	for (const cacheKey of cacheKeys) orgWithFeaturesL1.delete(cacheKey);

	await forEachMiscRedisTarget({
		// One DEL per key: these keys have no hash tag, so a multi-key DEL is
		// rejected with CROSSSLOT on a clustered instance and nothing is deleted.
		operation: ({ redis }) =>
			Promise.all(
				cacheKeys.map((cacheKey) =>
					runRedisOp({
						operation: () => redis.del(cacheKey),
						source: "org-features-cache:clear",
						redisInstance: redis,
					}),
				),
			),
		onError: ({ target }) => {
			logger.warn(
				`[orgWithFeaturesCache] clear failed on "${target.instanceName}" (org: ${orgId})`,
			);
		},
	});
};
