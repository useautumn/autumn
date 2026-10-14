import {
	type Catalog,
	type CatalogKey,
	type CatalogRow,
	catalogKeyToString,
	catalogRowsToCatalog,
	parseCatalogRow,
} from "@autumn/balance-engine";
import type {
	CatalogCacheScope,
	CatalogRead,
} from "../types/catalogCacheContext.js";
import { isCatalogRowCurrent } from "./catalogVersions.js";

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
	allowStale?: boolean;
}): Catalog => {
	const rows: CatalogRow[] = [];
	const read: CatalogRead = {
		changeCount: scope.state.changeCount,
		rows: [],
	};
	for (const key of keys) {
		const cacheKey = catalogKeyToString({ key });
		const row = scope.state.entries.get(cacheKey, { allowStale });
		const answered =
			row && (allowStale || isCatalogRowCurrent({ scope, row }))
				? row
				: undefined;
		read.rows.push([cacheKey, answered]);
		if (answered) rows.push(parsedRowOf({ row: answered }));
	}
	const catalog = catalogRowsToCatalog({ rows });
	scope.state.reads.set(catalog, read);
	return catalog;
};
