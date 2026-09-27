import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { orgEnvScope, orgScope } from "./invalidationIndex.js";

/** Expired, not deleted: a strict read refetches, while a decision already past `ensure` still reads its stale row. */
const EXPIRED_TTL_MS = 1;

/** O(rows of the org), through the index the LRU keeps: never a scan of the cache. */
export const invalidateCatalog = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): { expiredCount: number } => {
	const { entries, keysByScope } = scope.state;
	const keys = [
		...(keysByScope.get(orgScope({ orgId })) ?? []),
		...(keysByScope.get(orgEnvScope({ orgId, env })) ?? []),
	];
	for (const key of keys) {
		const row = entries.peek(key);
		// Same value: the LRU only moves the ttl, so the index entry stays.
		if (row) entries.set(key, row, { ttl: EXPIRED_TTL_MS });
	}
	return { expiredCount: keys.length };
};
