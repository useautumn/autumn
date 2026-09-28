import {
	type Catalog,
	type CatalogKey,
	catalogRowToCatalogKey,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	mergeCatalogs,
} from "@autumn/balance-engine";
import type { CatalogCache } from "../types/catalogCache.js";

/** The rows behind `keys` that any source has, loaded on a miss; a key nobody has is simply absent. */
export const ensureCatalogForKeys = async ({
	catalogCache,
	identity,
	keys,
}: {
	catalogCache: Pick<CatalogCache, "read" | "load">;
	identity: MeteringIdentity;
	keys: CatalogKey[];
}): Promise<Catalog> => {
	const cached = catalogCache.read({ keys });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog: cached });
	if (missing.length === 0) return cached;
	const loaded = await catalogCache.load({ identity, keys: missing });
	// What was just read answers this call even if an invalidation raced it; a later strict read refetches.
	const refreshed = catalogCache.read({
		keys: loaded.map((row) => catalogRowToCatalogKey({ row })),
		allowStale: true,
	});
	return mergeCatalogs({ catalogs: [cached, refreshed] });
};
