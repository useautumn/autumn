import {
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { catalogVersionOf } from "./catalogVersions.js";

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
	versionOf = ({ row }) => catalogVersionOf({ scope, row }),
}: {
	scope: CatalogCacheScope;
	rows: CatalogRow[];
	/** The version each row was read under; rows read elsewhere are taken as current. */
	versionOf?: (params: { row: CatalogRow }) => number;
}): void => {
	for (const row of rows) {
		scope.state.rowVersions.set(row, versionOf({ row }));
		scope.state.entries.set(
			catalogKeyToString({ key: catalogRowToCatalogKey({ row }) }),
			row,
			{ ttl: ttlOf({ row, scope }) },
		);
	}
};
