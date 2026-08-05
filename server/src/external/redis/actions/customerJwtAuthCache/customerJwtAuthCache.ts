import type { Feature, Organization } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	forEachMiscRedisTarget,
	resolveMiscRedis,
} from "@/external/redis/miscCache/resolveMiscRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

export const CUSTOMER_JWT_AUTH_CACHE_TTL_SECONDS = 3600;

/** Org + features + the revocation epoch, in ONE entry keyed by the immutable
 *  internal_customer_id. Pure read-through cache — Postgres is the source of
 *  truth, so reads are ramp-routable by requestId. */
export type CachedCustomerJwtAuth = {
	org: Organization;
	features: Feature[];
	epoch: number;
	refreshKid: number;
	indefinite: boolean;
};

export const buildCustomerJwtAuthCacheKey = (internalCustomerId: string) =>
	`cjwt_auth:${internalCustomerId}`;

export const getCachedCustomerJwtAuth = async ({
	internalCustomerId,
	requestId,
}: {
	internalCustomerId: string;
	requestId?: string;
}): Promise<CachedCustomerJwtAuth | null> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildCustomerJwtAuthCacheKey(internalCustomerId);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(cacheKey),
		source: "customer-jwt-auth-cache:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as CachedCustomerJwtAuth;
};

export const setCachedCustomerJwtAuth = async ({
	internalCustomerId,
	value,
	requestId,
}: {
	internalCustomerId: string;
	value: CachedCustomerJwtAuth;
	requestId?: string;
}): Promise<void> => {
	const miscRedis = resolveMiscRedis({ requestId });
	const cacheKey = buildCustomerJwtAuthCacheKey(internalCustomerId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(
				cacheKey,
				JSON.stringify(value),
				"EX",
				CUSTOMER_JWT_AUTH_CACHE_TTL_SECONDS,
			),
		source: "customer-jwt-auth-cache:set",
		redisInstance: miscRedis,
	});
};

/** Drop the cached entry after any family write — on every live instance, so
 *  ramped readers never see a stale epoch. */
export const invalidateCustomerJwtAuth = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): Promise<void> => {
	const cacheKey = buildCustomerJwtAuthCacheKey(internalCustomerId);

	await forEachMiscRedisTarget({
		operation: ({ redis }) =>
			tryRedisOp({
				operation: () => redis.del(cacheKey),
				source: "customer-jwt-auth-cache:invalidate",
				redisInstance: redis,
			}),
		onError: ({ target }) => {
			logger.warn(
				`[customerJwtAuthCache] invalidate failed on "${target.instanceName}" (internalCustomerId=${internalCustomerId})`,
			);
		},
	});
};
