import type { CatalogRow } from "@autumn/balance-engine";
import { LRUCache } from "lru-cache";
import { invalidateCatalog } from "./actions/invalidateCatalog.js";
import { loadCatalogRows } from "./actions/loadCatalogRows.js";
import { putCatalogRows } from "./actions/putCatalogRows.js";
import { readCatalog } from "./actions/readCatalog.js";
import type { CatalogCache } from "./types/catalogCache.js";
import type {
	CatalogCacheContext,
	CatalogCacheScope,
} from "./types/catalogCacheContext.js";

const validateConfig = ({ ctx }: { ctx: CatalogCacheContext }): void => {
	for (const [name, value] of Object.entries(ctx.config)) {
		if (!Number.isSafeInteger(value) || value <= 0)
			throw new RangeError(`${name} must be a positive safe integer`);
	}
};

export const createCatalogCache = ({
	ctx,
}: {
	ctx: CatalogCacheContext;
}): CatalogCache => {
	validateConfig({ ctx });
	const scope: CatalogCacheScope = {
		ctx,
		state: {
			entries: new LRUCache<string, CatalogRow>({
				maxSize: ctx.config.maxSizeBytes,
				sizeCalculation: (row) => JSON.stringify(row).length,
				// Default ttl; a per-entry ttl of 0 on set opts a row out of expiry.
				ttl: ctx.config.mutableRowTtlMs,
				// An expired row is kept and stays retrievable by an explicit stale
				// read. Refreshing still happens on the strict read that `ensure`
				// does, so rows do not go stale indefinitely; this only stops a row
				// ageing out between `ensure` filling the cache and the decision
				// reading it, which failed the request outright.
				allowStale: true,
				// Without this the first stale read drops the row, so the next
				// decision on the same key fails exactly the way this is meant to
				// prevent. The row survives until `ensure` replaces it.
				noDeleteOnStaleGet: true,
			}),
			inFlight: new Map(),
		},
	};

	return {
		read: ({ keys, allowStale }) => readCatalog({ scope, keys, allowStale }),
		load: ({ identity, keys }) => loadCatalogRows({ scope, identity, keys }),
		put: ({ rows }) => putCatalogRows({ scope, rows }),
		invalidate: ({ orgId, env }) => invalidateCatalog({ scope, orgId, env }),
		size: () => scope.state.entries.size,
	};
};
