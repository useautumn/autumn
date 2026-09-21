import type {
	Catalog,
	CatalogKey,
	CatalogRow,
	MeteringIdentity,
} from "@autumn/balance-engine";

/** The worker's in-memory copy of the catalog rows its states reference. */
export type CatalogCache = {
	/** Synchronous: the cached rows among `keys`; anything absent is simply not in
	 *  the result. Expired rows are excluded unless `allowStale` asks for them. */
	read(params: { keys: CatalogKey[]; allowStale?: boolean }): Catalog;
	/** Resolves `keys` through the source and caches what it finds; concurrent calls share one fetch per key. */
	load(params: {
		identity: MeteringIdentity;
		keys: CatalogKey[];
	}): Promise<void>;
	put(params: { rows: CatalogRow[] }): void;
	/** Drops the org's products, features and base entitlements; custom entitlements are minted, never edited. */
	invalidate(params: { orgId: string; env: string }): { droppedCount: number };
	size(): number;
};
