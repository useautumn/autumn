import type { Catalog } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { isCatalogRowCurrent } from "./catalogVersions.js";

/** True while every key the read asked for still holds the same row, none invalidated; a ttl alone doesn't count.
 *  Other rows coming and going don't matter, and a cache that hasn't changed answers without looking at the keys. */
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
