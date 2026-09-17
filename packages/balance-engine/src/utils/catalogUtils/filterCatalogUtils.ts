import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";

/** The keys this catalog cannot answer for; empty means compute can run. */
export const filterCatalogKeysMissingFrom = ({
	keys,
	catalog,
}: {
	keys: CatalogKey[];
	catalog: Catalog;
}): CatalogKey[] => keys.filter((key) => !(key.id in catalog[key.table]));
