import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import { OrgService } from "../OrgService.js";

/** Bounds staleness when proactive cache invalidation misses. */
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isOrgWithFeaturesEnvelope = (
	value: unknown,
): value is OrgWithFeatures => {
	if (!isRecord(value) || !isRecord(value.org)) return false;

	return (
		typeof value.org.id === "string" &&
		value.org.id.length > 0 &&
		Array.isArray(value.features)
	);
};

/** A corrupt cache entry must read as a miss, not an error that lasts the TTL. */
export const parseCachedOrgWithFeatures = ({
	cached,
}: {
	cached: string | null;
}): OrgWithFeatures | null => {
	if (!cached) return null;

	try {
		const parsed: unknown = JSON.parse(cached);
		return isOrgWithFeaturesEnvelope(parsed) ? parsed : null;
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

/** Read-through cache; Redis failures and corrupt entries fall back to Postgres. */
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

	const fresh = await OrgService.getWithFeatures({
		db,
		orgId,
		env,
		allowNotFound: true,
	});
	if (!fresh) return null;

	await setCachedOrgWithFeatures({ orgId, env, data: fresh });
	return fresh;
};
