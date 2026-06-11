import {
	type AppEnv,
	customerJwtFamilies,
	type Feature,
	type Organization,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import {
	getConfiguredRegions,
	getRegionalRedis,
	redis,
} from "@/external/redis/initRedis.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

/**
 * Hot-path read for a customer-JWT request: org + features + the revocation
 * epoch, in ONE entry keyed by the immutable internal_customer_id.
 *
 * Redis is ONLY a cache here. Cache miss/down → reload from Postgres (the
 * source of truth). DB down → the load throws and auth fails — same as the
 * secret-key path; no fail-open special-casing.
 */
const CACHE_TTL_SECONDS = 3600;

type JwtAuth = {
	org: Organization;
	features: Feature[];
	epoch: number;
	refreshKid: number;
	indefinite: boolean;
};

const buildKey = (internalCustomerId: string) =>
	`cjwt_auth:${internalCustomerId}`;

export const getCustomerJwtAuth = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): Promise<JwtAuth | null> => {
	const cacheKey = buildKey(internalCustomerId);

	try {
		const cached = await tryRedisRead(() => redis.get(cacheKey));
		if (cached) {
			return JSON.parse(cached) as JwtAuth;
		}
	} catch {
		// Cache unavailable → fall through to the DB.
	}

	// Source of truth. A missing family means the customer was deleted (FK
	// cascade) or never minted — either way the token is no longer valid.
	const family = await db.query.customerJwtFamilies.findFirst({
		where: eq(customerJwtFamilies.internal_customer_id, internalCustomerId),
	});
	if (!family) {
		return null;
	}
	const orgData = await OrgService.getWithFeatures({
		db,
		orgId: family.org_id,
		env: family.env as AppEnv,
		allowNotFound: true,
	});
	if (!orgData) {
		return null;
	}

	const value: JwtAuth = {
		org: orgData.org,
		features: orgData.features,
		epoch: family.epoch,
		refreshKid: family.refresh_kid,
		indefinite: family.indefinite,
	};

	try {
		await tryRedisWrite(() =>
			redis.set(cacheKey, JSON.stringify(value), "EX", CACHE_TTL_SECONDS),
		);
	} catch {
		// Best-effort backfill.
	}

	return value;
};

/** Drop the cached entry across regions after any family write. */
export const invalidateCustomerJwtAuth = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}) => {
	const cacheKey = buildKey(internalCustomerId);
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
