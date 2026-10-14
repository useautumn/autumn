import type { Catalog } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { isCatalogRowCurrent } from "./catalogVersions.js";

export const isCatalogCurrent = ({
	scope,
	catalog,
}: {
	scope: CatalogCacheScope;
	catalog: Catalog;
}): boolean => {
	const read = scope.state.reads.get(catalog);
	if (!read) return false;
	if (read.changeCount === scope.state.changeCount) return true;
	for (const [key, row] of read.rows) {
		if (scope.state.entries.peek(key, { allowStale: true }) !== row)
			return false;
		if (row && !isCatalogRowCurrent({ scope, row })) return false;
	}
	read.changeCount = scope.state.changeCount;
	return true;
};
