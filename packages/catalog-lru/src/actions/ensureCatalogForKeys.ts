import {
	type Catalog,
	type CatalogKey,
	catalogRowToCatalogKey,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	mergeCatalogs,
} from "@autumn/balance-engine";
import type { CatalogCache } from "../types/catalogCache.js";

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
	const refreshed = catalogCache.read({
		keys: loaded.map((row) => catalogRowToCatalogKey({ row })),
		allowStale: true,
	});
	return mergeCatalogs({ catalogs: [cached, refreshed] });
};
