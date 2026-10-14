import {
	type CatalogRow,
	catalogKeyToString,
	catalogRowToCatalogKey,
} from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { catalogVersionOf } from "./catalogVersions.js";

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
