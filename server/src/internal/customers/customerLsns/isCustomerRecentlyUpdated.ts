import { sql } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { REPLICA_LAG_MAX_MS } from "@/db/probes/replicaLagProbe.js";

export const CUSTOMER_FRESHNESS_WINDOW_S = REPLICA_LAG_MAX_MS / 1000;

export const NEGATIVE_TTL_MS = 2_000;
export const NEGATIVE_CACHE_MAX_ENTRIES = 5_000;

const negativeCache = new LRUCache<string, true>({
	max: NEGATIVE_CACHE_MAX_ENTRIES,
	ttl: NEGATIVE_TTL_MS,
});

export const _resetRecentlyUpdatedNegativeCacheForTesting = (): void => {
	negativeCache.clear();
};

const buildNegativeCacheKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}): string => `${orgId}:${env}:${customerId}`;

export const invalidateRecentlyUpdatedNegativeCache = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}): void => {
	negativeCache.delete(buildNegativeCacheKey({ orgId, env, customerId }));
};

export const _recentlyUpdatedNegativeCacheSizeForTesting = (): number =>
	negativeCache.size;

export const isCustomerRecentlyUpdated = async ({
	db,
	orgId,
	env,
	customerId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	customerId: string;
}): Promise<boolean> => {
	const cacheKey = buildNegativeCacheKey({ orgId, env, customerId });
	if (negativeCache.get(cacheKey)) return false;

	const rows = await db.execute(sql`
		SELECT true AS fresh
		FROM customer_lsns
		WHERE org_id = ${orgId}
			AND env = ${env}
			AND customer_id = ${customerId}
			AND updated_at > now() - make_interval(secs => ${CUSTOMER_FRESHNESS_WINDOW_S})
		LIMIT 1
	`);

	if (rows.length > 0) return true;

	negativeCache.set(cacheKey, true);
	return false;
};
