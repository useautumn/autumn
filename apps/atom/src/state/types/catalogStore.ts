import type { Catalog, CatalogRow } from "@autumn/balance-engine";

export type SharedCatalog = { catalog: Catalog; readAt: number };

export type CatalogStore = {
	read(): SharedCatalog | null;
	set(params: { rows: CatalogRow[]; readAt: number }): boolean;
	install(params: { rows: CatalogRow[]; readAt: number }): boolean;
	rows(): { rows: CatalogRow[]; readAt: number } | null;
	close(): void;
};
