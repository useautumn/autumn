import {
	type Catalog,
	type CatalogKey,
	type CatalogRow,
	catalogKeyToString,
	catalogRowsToCatalog,
} from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

export const readCatalog = ({
	scope,
	keys,
}: {
	scope: CatalogCacheScope;
	keys: CatalogKey[];
}): Catalog => {
	const rows: CatalogRow[] = [];
	for (const key of keys) {
		const row = scope.state.entries.get(catalogKeyToString({ key }));
		if (row) rows.push(row);
	}
	return catalogRowsToCatalog({ rows });
};
