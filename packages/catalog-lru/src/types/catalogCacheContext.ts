import type {
	Catalog,
	CatalogRow,
	MeteringIdentity,
} from "@autumn/balance-engine";
import type { CatalogRowIds, CatalogRowsEnvelope } from "@autumn/postgres";
import type { LRUCache } from "lru-cache";

export type CatalogRowsSource = {
	getCatalogRows(params: {
		identity: MeteringIdentity;
		ids: CatalogRowIds;
	}): Promise<CatalogRowsEnvelope>;
};

export type CatalogCacheConfig = {
	mutableRowTtlMs: number;
	maxSizeBytes: number;
};

export type KeysByInvalidationScope = Map<string, Set<string>>;

export type CatalogRead = {
	changeCount: number;
	rows: [key: string, row: CatalogRow | undefined][];
};

export type CatalogCacheState = {
	entries: LRUCache<string, CatalogRow>;
	keysByScope: KeysByInvalidationScope;
	inFlight: Map<string, Promise<CatalogRow[]>>;
	changeCount: number;
	reads: WeakMap<Catalog, CatalogRead>;
	catalogVersions: Map<string, number>;
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
