import {
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

/** Entitlements are retired and re-minted on edit, so a referenced row is never wrong; only LRU evicts them. */
const ttlOf = ({
	row,
	scope,
}: {
	row: CatalogRow;
	scope: CatalogCacheScope;
}): number =>
	row.table === "entitlements" ? 0 : scope.ctx.config.mutableRowTtlMs;

export const putCatalogRows = ({
	scope,
	rows,
}: {
	scope: CatalogCacheScope;
	rows: CatalogRow[];
}): void => {
	for (const row of rows) {
		scope.state.entries.set(
			catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
			row,
			{ ttl: ttlOf({ row, scope }) },
		);
	}
};
