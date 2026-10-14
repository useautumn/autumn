import type { CatalogRow } from "@autumn/balance-engine";
import { LRUCache } from "lru-cache";
import { invalidateCatalog } from "./actions/invalidateCatalog.js";
import {
	indexCatalogRow,
	unindexCatalogRow,
} from "./actions/invalidationIndex.js";
import { isCatalogCurrent } from "./actions/isCatalogCurrent.js";
import { loadCatalogRows } from "./actions/loadCatalogRows.js";
import { putCatalogRows } from "./actions/putCatalogRows.js";
import { readCatalog } from "./actions/readCatalog.js";
import type { CatalogCache } from "./types/catalogCache.js";
import type {
	CatalogCacheContext,
	CatalogCacheScope,
	KeysByInvalidationScope,
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
	const keysByScope: KeysByInvalidationScope = new Map();
	const scope: CatalogCacheScope = {
		ctx,
		state: {
			entries: new LRUCache<string, CatalogRow>({
				maxSize: ctx.config.maxSizeBytes,
				sizeCalculation: (row) => JSON.stringify(row).length,
				ttl: ctx.config.mutableRowTtlMs,
				allowStale: true,
				noDeleteOnStaleGet: true,
				onInsert: recordInsert,
				dispose: recordRemoval,
			}),
			keysByScope,
			inFlight: new Map(),
			changeCount: 0,
			reads: new WeakMap(),
			catalogVersions: new Map(),
			rowVersions: new WeakMap(),
		},
	};

	function recordInsert(row: CatalogRow, key: string): void {
		scope.state.changeCount += 1;
		indexCatalogRow({ keysByScope, key, row });
	}

	function recordRemoval(row: CatalogRow, key: string): void {
		scope.state.changeCount += 1;
		unindexCatalogRow({ keysByScope, key, row });
	}

	return {
		read: ({ keys, allowStale }) => readCatalog({ scope, keys, allowStale }),
		load: ({ identity, keys }) => loadCatalogRows({ scope, identity, keys }),
		put: ({ rows }) => putCatalogRows({ scope, rows }),
		invalidate: ({ orgId, env }) => invalidateCatalog({ scope, orgId, env }),
		size: () => scope.state.entries.size,
		isCurrent: ({ catalog }) => isCatalogCurrent({ scope, catalog }),
	};
};
