import { sql } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { REPLICA_LAG_MAX_MS } from "@/db/probes/replicaLagProbe.js";

/** Derived from REPLICA_LAG_MAX_MS so the ledger window and the replica lag
 *  bound cannot drift apart — the ledger only covers lag inside this window. */
export const CUSTOMER_FRESHNESS_WINDOW_S = REPLICA_LAG_MAX_MS / 1000;

export const NEGATIVE_TTL_MS = 2_000;
export const NEGATIVE_CACHE_MAX_ENTRIES = 5_000;

// Negatives only: worst case a write lands mid-window and one read goes replica —
// stale by ≤ NEGATIVE_TTL_MS + replica lag, well inside the 60s ledger window.
const negativeCache = new LRUCache<string, true>({
	max: NEGATIVE_CACHE_MAX_ENTRIES,
	ttl: NEGATIVE_TTL_MS,
});

export const _resetRecentlyUpdatedNegativeCacheForTesting = (): void => {
	negativeCache.clear();
};

export const _recentlyUpdatedNegativeCacheSizeForTesting = (): number =>
	negativeCache.size;

/** True when the customer had a structural write inside the freshness window
 *  (DB clock only) — such reads must be routed to the primary. */
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
	const cacheKey = `${orgId}:${env}:${customerId}`;
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
