import type { CatalogRow } from "@autumn/balance-engine";
import type { LRUCache } from "lru-cache";
import type { WorkerDb } from "../../types/workerDb.js";

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
	db: Pick<WorkerDb, "getCatalogRows">;
	config: CatalogCacheConfig;
};

export type CatalogCacheScope = {
	ctx: CatalogCacheContext;
	state: CatalogCacheState;
};
