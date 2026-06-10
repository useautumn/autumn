import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Org + features for a customer-JWT request, cached in Redis over Postgres
 * (mirrors the secret-key cache). Every Redis touch is wrapped so a cache
 * failure falls through to the DB — auth never breaks on a Redis outage.
 */
const CUSTOMER_JWT_ORG_CACHE_TTL_SECONDS = 3600;

type CachedJwtOrg = NonNullable<
	Awaited<ReturnType<typeof OrgService.getWithFeatures>>
>;

const buildKey = (orgId: string, env: AppEnv) => `cjwt_org:${orgId}:${env}`;

export const getCustomerJwtOrg = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<CachedJwtOrg | null> => {
	const cacheKey = buildKey(orgId, env);

	try {
		const cached = await tryRedisRead(() => redis.get(cacheKey));
		if (cached) {
			return JSON.parse(cached) as CachedJwtOrg;
		}
	} catch {
		// Redis unavailable ⇒ fall through to DB.
	}

	const data = await OrgService.getWithFeatures({
		db,
		orgId,
		env,
		allowNotFound: true,
	});
	if (!data) {
		return null;
	}

	try {
		await tryRedisWrite(() =>
			redis.set(
				cacheKey,
				JSON.stringify(data),
				"EX",
				CUSTOMER_JWT_ORG_CACHE_TTL_SECONDS,
			),
		);
	} catch {
		// Best-effort backfill.
	}

	return data;
};

/** Invalidate across regions (e.g. when org features change). */
export const clearCustomerJwtOrgCache = async ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => {
	const cacheKey = buildKey(orgId, env);
	await Promise.all(
		getConfiguredRegions().map(async (region) => {
			const regional = getRegionalRedis(region);
			if (regional.status !== "ready") {
				return;
			}
			await tryRedisWrite(() => regional.del(cacheKey), regional);
		}),
	);
};
