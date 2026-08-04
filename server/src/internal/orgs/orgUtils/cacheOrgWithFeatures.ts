import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { miscRedis } from "@/external/redis/initRedis.js";
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

export const getCachedOrgWithFeatures = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): Promise<OrgWithFeatures | null> => {
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "org-features-cache:get",
		redisInstance: miscRedis,
	});

	if (!cached) return null;

	return JSON.parse(cached) as OrgWithFeatures;
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
		operation: () => miscRedis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "org-features-cache:set",
		redisInstance: miscRedis,
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
		envs.map((targetEnv) =>
			tryRedisOp({
				operation: () =>
					miscRedis.del(
						buildOrgWithFeaturesCacheKey({ orgId, env: targetEnv }),
					),
				source: "org-features-cache:clear",
				redisInstance: miscRedis,
				onError: () => {
					logger.warn("[clearOrgWithFeaturesCache] delete_failed");
				},
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
 * Redis is strictly an accelerator: every op goes through `tryRedisOp`, which
 * swallows failures, so an outage reads as a cache miss and falls through to
 * Postgres. That must hold — if a Redis error escaped here,
 * `createWorkerContext` would catch it, treat the org as missing, and silently
 * acknowledge queued jobs without recording usage.
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
