import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { OrgService } from "../OrgService.js";

/** Short by design: org config changes are also pushed through clearOrgCache, so
 *  this only has to bound the staleness window for anything that misses that. */
export const ORG_WITH_FEATURES_CACHE_TTL_SECONDS = 60;

type OrgWithFeatures = NonNullable<
	Awaited<ReturnType<typeof OrgService.getWithFeatures>>
>;

export const buildOrgWithFeaturesCacheKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => `org_with_features:${orgId}:${env}`;

/** A corrupt cache entry must read as a miss, not an error that lasts the TTL. */
export const parseCachedOrgWithFeatures = ({
	cached,
}: {
	cached: string | null;
}): OrgWithFeatures | null => {
	if (!cached) return null;

	try {
		return JSON.parse(cached) as OrgWithFeatures;
	} catch {
		return null;
	}
};

export const getCachedOrgWithFeatures = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): Promise<OrgWithFeatures | null> => {
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	const cached = await tryRedisOp({
		operation: () => redis.get(cacheKey),
		source: "org-features-cache:get",
	});

	return parseCachedOrgWithFeatures({ cached: cached ?? null });
};

export const setCachedOrgWithFeatures = async ({
	orgId,
	env,
	data,
	ttl = ORG_WITH_FEATURES_CACHE_TTL_SECONDS,
}: {
	orgId: string;
	env: AppEnv;
	data: OrgWithFeatures;
	ttl?: number;
}) => {
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	await tryRedisOp({
		operation: () => redis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "org-features-cache:set",
	});
};

export const clearOrgWithFeaturesCache = async ({
	orgId,
	env,
	logger = console,
}: {
	orgId: string;
	/** Omit to clear every env. */
	env?: AppEnv;
	logger?: Pick<Console, "error" | "warn">;
}) => {
	const envs = env ? [env] : [AppEnv.Live, AppEnv.Sandbox];

	await Promise.all(
		getConfiguredRegions().flatMap((region) =>
			envs.map((targetEnv) => {
				const regionalRedis = getRegionalRedis(region);

				return tryRedisOp({
					operation: () =>
						regionalRedis.del(
							buildOrgWithFeaturesCacheKey({ orgId, env: targetEnv }),
						),
					source: `org-features-cache:clear:${region}`,
					redisInstance: regionalRedis,
					onError: () => {
						logger.warn(`[clearOrgWithFeaturesCache] ${region}: delete_failed`);
					},
				});
			}),
		),
	);
};

/**
 * Read-through cache around `OrgService.getWithFeatures`.
 *
 * Queue workers call this once per message and async `balances.track` enqueues
 * one message per API request, so the uncached path was running ~1,140 times a
 * second against Postgres — 3.08M lookups in 45 minutes, 8.4% of database time —
 * for a row that barely changes.
 *
 * Redis is strictly an accelerator: reads go through `tryRedisOp` (which
 * swallows failures) and a parse guard, so outages and corrupt entries read as
 * cache misses and fall through to Postgres. Only Postgres errors escape, and
 * `createWorkerContext` propagates those so queued jobs retry — `null` strictly
 * means the org does not exist.
 */
export const getOrgWithFeaturesCached = async ({
	db,
	orgId,
	env,
	skipCache = false,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	skipCache?: boolean;
}): Promise<OrgWithFeatures | null> => {
	if (!skipCache) {
		const cached = await getCachedOrgWithFeatures({ orgId, env });
		if (cached) return cached;
	}

	const fresh = await OrgService.getWithFeatures({ db, orgId, env });
	if (!fresh) return null;

	await setCachedOrgWithFeatures({ orgId, env, data: fresh });
	return fresh;
};
