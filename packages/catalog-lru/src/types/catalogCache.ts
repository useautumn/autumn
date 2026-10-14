import type {
	Catalog,
	CatalogKey,
	CatalogRow,
	MeteringIdentity,
} from "@autumn/balance-engine";

export type CatalogCache = {
	read(params: { keys: CatalogKey[]; allowStale?: boolean }): Catalog;
	load(params: {
		identity: MeteringIdentity;
		keys: CatalogKey[];
	}): Promise<CatalogRow[]>;
	put(params: { rows: CatalogRow[] }): void;
	invalidate(params: { orgId: string; env: string }): { expiredCount: number };
	size(): number;
	isCurrent(params: { catalog: Catalog }): boolean;
};
