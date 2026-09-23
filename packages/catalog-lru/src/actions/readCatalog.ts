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
	allowStale = false,
}: {
	scope: CatalogCacheScope;
	keys: CatalogKey[];
	/** Accept a row whose ttl has passed. Only the decision itself should, and
	 *  only because it runs after `ensure` has already refreshed what was due. */
	allowStale?: boolean;
}): Catalog => {
	const rows: CatalogRow[] = [];
	for (const key of keys) {
		const row = scope.state.entries.get(catalogKeyToString({ key }), {
			allowStale,
		});
		if (row) rows.push(row);
	}
	return catalogRowsToCatalog({ rows });
};
