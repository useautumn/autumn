import type { CatalogRow } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

/** Entitlements carry no env, so they match on org alone; custom ones belong to one customer and never change. */
const isInvalidatedBy = ({
	row,
	orgId,
	env,
}: {
	row: CatalogRow;
	orgId: string;
	env: string;
}): boolean => {
	if (row.row.org_id !== orgId) return false;
	if (row.table === "entitlements") return !row.row.is_custom;
	return row.row.env === env;
};

export const invalidateCatalog = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): { droppedCount: number } => {
	const { entries } = scope.state;
	let droppedCount = 0;
	for (const [key, row] of entries.entries()) {
		if (!isInvalidatedBy({ row, orgId, env })) continue;
		entries.delete(key);
		droppedCount += 1;
	}
	return { droppedCount };
};
