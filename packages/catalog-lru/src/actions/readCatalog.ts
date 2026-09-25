import {
	type Catalog,
	type CatalogKey,
	type CatalogRow,
	catalogKeyToString,
	catalogRowsToCatalog,
	parseCatalogRow,
} from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

/** Every check and track reads the catalog, so a stored row is validated once and
 *  the result reused while that row stays cached; a replaced row is parsed afresh.
 *  Shared across decisions, so it is frozen: a mutation throws instead of leaking. */
const parsedRows = new WeakMap<CatalogRow, CatalogRow>();

const deepFreeze = <Value>(value: Value): Value => {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
};

const parsedRowOf = ({ row }: { row: CatalogRow }): CatalogRow => {
	const cached = parsedRows.get(row);
	if (cached) return cached;
	const parsed = deepFreeze(parseCatalogRow({ input: row }));
	parsedRows.set(row, parsed);
	return parsed;
};

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
		if (row) rows.push(parsedRowOf({ row }));
	}
	return catalogRowsToCatalog({ rows });
};
