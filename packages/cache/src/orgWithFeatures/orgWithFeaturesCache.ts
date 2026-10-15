import { AppEnv } from "@autumn/shared";
import { LRUCache } from "lru-cache";
import type { ReadThroughCacheContext } from "../misc/types/readThroughCacheContext.js";
import { REDIS_OP_TIMEOUT_MS } from "../ops/redisOpTimeouts.js";
import { runRedisOp, tryRedisOp } from "../ops/runRedisOp.js";

/** Short by design: org config changes are also pushed through clearOrgCache, so
 *  this only has to bound the staleness window for anything that misses that. */
export const ORG_WITH_FEATURES_CACHE_TTL_SECONDS = 60;

// This TTL is the invalidation window: a clear only reaches the calling process's
// L1, so every other process serves stale org config until it lapses.
export const ORG_WITH_FEATURES_L1_TTL_MS = 5_000;
/** An org payload carries every feature, so this holds only the handful of orgs a process is hot on. */
export const ORG_WITH_FEATURES_L1_MAX_ENTRIES = 500;

type OrgWithFeaturesL1Entry = { value: unknown };

let orgWithFeaturesL1: LRUCache<string, OrgWithFeaturesL1Entry> | undefined;

/** Per-process L1. Each process gets its own copy — intended. */
const getOrgWithFeaturesL1 = () => {
	orgWithFeaturesL1 ??= new LRUCache<string, OrgWithFeaturesL1Entry>({
		max: ORG_WITH_FEATURES_L1_MAX_ENTRIES,
		ttl: ORG_WITH_FEATURES_L1_TTL_MS,
	});
	return orgWithFeaturesL1;
};

/** One lookup per key at a time: a burst on a cold L1 joins it instead of repeating it. */
const inFlightLookups = new Map<string, Promise<unknown>>();

export const _resetOrgWithFeaturesL1ForTesting = () => {
	getOrgWithFeaturesL1().clear();
	inFlightLookups.clear();
};
export const _orgWithFeaturesL1SizeForTesting = () =>
	getOrgWithFeaturesL1().size;

export const buildOrgWithFeaturesCacheKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => `org_with_features:${orgId}:${env}`;

/** Rewritten by every clear, so a lookup that straddles a clear can tell its load is stale. */
export const buildOrgWithFeaturesClearTokenKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => `org_with_features_cleared:${orgId}:${env}`;

const CLEAR_TOKEN_TTL_SECONDS = 3600;

export const getCachedOrgWithFeatures = async <T>({
	ctx,
	orgId,
	env,
	requestId,
	skipL1 = false,
}: {
	ctx: ReadThroughCacheContext;
	orgId: string;
	env: AppEnv;
	requestId?: string;
	/** Read Redis directly: a clear only reaches the clearing process's L1. */
	skipL1?: boolean;
}): Promise<T | null> => {
	const redis = ctx.miscCache.resolve({ requestId });
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	// Hands back the cached reference, not a copy — callers must treat the org
	// and its features as read-only, or the write leaks into every later hit.
	const local = skipL1 ? undefined : getOrgWithFeaturesL1().get(cacheKey);
	if (local) return local.value as T;

	const cached = await tryRedisOp({
		operation: () => redis.get(cacheKey),
		source: "org-features-cache:get",
		redisInstance: redis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesGet,
	});
	if (!cached) return null;

	const parsed = JSON.parse(cached) as T;
	getOrgWithFeaturesL1().set(cacheKey, { value: parsed });
	return parsed;
};

export const setCachedOrgWithFeatures = async ({
	ctx,
	orgId,
	env,
	data,
	ttl = ORG_WITH_FEATURES_CACHE_TTL_SECONDS,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	orgId: string;
	env: AppEnv;
	data: unknown;
	ttl?: number;
	requestId?: string;
}) => {
	const redis = ctx.miscCache.resolve({ requestId });
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	getOrgWithFeaturesL1().set(cacheKey, { value: data });

	await tryRedisOp({
		operation: () => redis.set(cacheKey, JSON.stringify(data), "EX", ttl),
		source: "org-features-cache:set",
		redisInstance: redis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesSet,
	});
};

const readClearToken = ({
	redis,
	orgId,
	env,
}: {
	redis: ReturnType<ReadThroughCacheContext["miscCache"]["resolve"]>;
	orgId: string;
	env: AppEnv;
}) =>
	tryRedisOp({
		operation: () =>
			redis.get(buildOrgWithFeaturesClearTokenKey({ orgId, env })),
		source: "org-features-cache:clear-token",
		redisInstance: redis,
		timeoutMs: REDIS_OP_TIMEOUT_MS.orgFeaturesGet,
	});

/** Loads from the source and caches it, unless a clear landed mid-load and may have been for a write this load missed. */
const loadAndWriteBack = async <T>({
	ctx,
	orgId,
	env,
	load,
	requestId,
}: {
	ctx: ReadThroughCacheContext;
	orgId: string;
	env: AppEnv;
	load: () => Promise<T | null>;
	requestId?: string;
}): Promise<T | null> => {
	const redis = ctx.miscCache.resolve({ requestId });
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });

	// 1. Note the clear token, then load
	const tokenBeforeLoad = await readClearToken({ redis, orgId, env });
	const fresh = await load();
	if (!fresh) return null;

	// 2. Write back to L1 and Redis
	await setCachedOrgWithFeatures({ ctx, orgId, env, data: fresh, requestId });

	// 3. A clear since step 1 means the write-back may be stale: drop it (the caller still gets this load)
	const tokenAfterWrite = await readClearToken({ redis, orgId, env });
	if (tokenAfterWrite !== tokenBeforeLoad) {
		getOrgWithFeaturesL1().delete(cacheKey);
		await tryRedisOp({
			operation: () => redis.del(cacheKey),
			source: "org-features-cache:discard-stale",
			redisInstance: redis,
		});
	}
	return fresh;
};

/** L1, then Redis, then `load` (written back to both); concurrent callers for one org share a single lookup. */
export const readThroughOrgWithFeatures = <T>({
	ctx,
	orgId,
	env,
	load,
	requestId,
	skipL1 = false,
}: {
	ctx: ReadThroughCacheContext;
	orgId: string;
	env: AppEnv;
	load: () => Promise<T | null>;
	requestId?: string;
	skipL1?: boolean;
}): Promise<T | null> => {
	const cacheKey = buildOrgWithFeaturesCacheKey({ orgId, env });
	const local = skipL1 ? undefined : getOrgWithFeaturesL1().get(cacheKey);
	if (local) return Promise.resolve(local.value as T);

	const inFlight = inFlightLookups.get(cacheKey);
	if (inFlight) return inFlight as Promise<T | null>;

	const lookup: Promise<T | null> = (async () =>
		(await getCachedOrgWithFeatures<T>({
			ctx,
			orgId,
			env,
			requestId,
			skipL1,
		})) ?? loadAndWriteBack({ ctx, orgId, env, load, requestId }))().finally(
		() => {
			// A clear may already have replaced this lookup; never drop a newer one.
			if (inFlightLookups.get(cacheKey) === lookup)
				inFlightLookups.delete(cacheKey);
		},
	);
	inFlightLookups.set(cacheKey, lookup);
	return lookup;
};

/** Drop the cached org on every live instance — ramped readers must never see stale org config. */
export const clearOrgWithFeaturesCache = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: ReadThroughCacheContext;
	orgId: string;
	/** Omit to clear every env. */
	env?: AppEnv;
}) => {
	const envs = env ? [env] : [AppEnv.Live, AppEnv.Sandbox];
	const cacheKeys = envs.map((targetEnv) =>
		buildOrgWithFeaturesCacheKey({ orgId, env: targetEnv }),
	);

	for (const cacheKey of cacheKeys) {
		getOrgWithFeaturesL1().delete(cacheKey);
		// Callers after a clear must not join a lookup that started before it.
		inFlightLookups.delete(cacheKey);
	}

	const clearToken = crypto.randomUUID();
	await ctx.miscCache.forEachTarget({
		// One DEL per key: these keys have no hash tag, so a multi-key DEL is
		// rejected with CROSSSLOT on a clustered instance and nothing is deleted.
		// The token is written first, so a lookup whose write lands after the DEL sees it.
		operation: ({ redis }) =>
			Promise.all(
				envs.map(async (targetEnv) => {
					await runRedisOp({
						operation: () =>
							redis.set(
								buildOrgWithFeaturesClearTokenKey({ orgId, env: targetEnv }),
								clearToken,
								"EX",
								CLEAR_TOKEN_TTL_SECONDS,
							),
						source: "org-features-cache:clear-token",
						redisInstance: redis,
					});
					await runRedisOp({
						operation: () =>
							redis.del(
								buildOrgWithFeaturesCacheKey({ orgId, env: targetEnv }),
							),
						source: "org-features-cache:clear",
						redisInstance: redis,
					});
				}),
			),
		onError: ({ target }) =>
			ctx.logger.warn(
				`[orgWithFeaturesCache] clear failed on "${target.instanceName}" (org: ${orgId})`,
			),
	});
};
