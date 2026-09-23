import type { CatalogRow, MeteringIdentity } from "@autumn/balance-engine";
import type { CatalogRowIds, CatalogRowsEnvelope } from "@autumn/postgres";
import type { LRUCache } from "lru-cache";

/** Where a miss is read from: Postgres in every app, a stub in tests. */
export type CatalogRowsSource = {
	getCatalogRows(params: {
		identity: MeteringIdentity;
		ids: CatalogRowIds;
	}): Promise<CatalogRowsEnvelope>;
};

export type CatalogCacheConfig = {
	/** Products and features are edited in place; a cached copy is served at most this long if the invalidation signal is missed. */
	mutableRowTtlMs: number;
	/** Sum of JSON lengths across cached rows; LRU eviction keeps the cache under it. */
	maxSizeBytes: number;
};

/** Entries keyed by catalogKeyToString; one fetch per key in flight at a time. */
export type CatalogCacheState = {
	entries: LRUCache<string, CatalogRow>;
	inFlight: Map<string, Promise<void>>;
};

export type CatalogCacheContext = {
	db: CatalogRowsSource;
	config: CatalogCacheConfig;
};

export type CatalogCacheScope = {
	ctx: CatalogCacheContext;
	state: CatalogCacheState;
};
