import {
	type Catalog,
	type CatalogKey,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
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
	await catalogCache.load({ identity, keys: missing });
	return catalogCache.read({ keys });
};
