import type {
	Catalog,
	CatalogRow,
	MeteringIdentity,
} from "@autumn/balance-engine";
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

/** Invalidation scope (an org, or an org in one env) to the cached keys it expires. */
export type KeysByInvalidationScope = Map<string, Set<string>>;

/** What one `read` saw: each requested key and the row it answered with (undefined if none), at a change count. */
export type CatalogRead = {
	changeCount: number;
	rows: [key: string, row: CatalogRow | undefined][];
};

/** Entries keyed by catalogKeyToString; one fetch per key in flight at a time. */
export type CatalogCacheState = {
	entries: LRUCache<string, CatalogRow>;
	keysByScope: KeysByInvalidationScope;
	inFlight: Map<string, Promise<CatalogRow[]>>;
	/** Moves on every insert, removal and invalidation: while it stands still, every read catalog is current. */
	changeCount: number;
	/** The read behind each catalog `read` returned, so it can tell whether its own rows have moved since. */
	reads: WeakMap<Catalog, CatalogRead>;
	/** Invalidations received per scope (an org, or an org in one env). */
	catalogVersions: Map<string, number>;
	/** The version of its scope each cached row was read under; older than the scope's current version means stale. */
	rowVersions: WeakMap<CatalogRow, number>;
};

export type CatalogCacheContext = {
	db: CatalogRowsSource;
	config: CatalogCacheConfig;
};

export type CatalogCacheScope = {
	ctx: CatalogCacheContext;
	state: CatalogCacheState;
};
