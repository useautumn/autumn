import type { Catalog, CatalogRow } from "@autumn/balance-engine";

/** The org's shared catalog: every row that is not one customer's own, and when Autumn read them (epoch ms). */
export type SharedCatalog = { catalog: Catalog; readAt: number };

export type CatalogStore = {
	/** Null until Autumn has sent one. Held in memory, and read from the file again only when another process has written it. */
	read(): SharedCatalog | null;
	/** Replaces every row: what Autumn sends is the whole shared catalog. False when it was read before the one held, and so ignored. */
	set(params: { rows: CatalogRow[]; readAt: number }): boolean;
	close(): void;
};
