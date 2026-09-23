import type { CatalogRow } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";

/** Entitlements and prices carry no env, so they match on org alone; custom ones belong to one customer, which no org-wide edit touches. */
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
	if (row.table === "entitlements" || row.table === "prices")
		return !row.row.is_custom;
	return row.row.env === env;
};

/** Expired, not deleted: a strict read refetches, while a decision already past `ensure` still reads its stale row. */
const EXPIRED_TTL_MS = 1;

export const invalidateCatalog = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): { expiredCount: number } => {
	const { entries } = scope.state;
	// Collected first: a set moves the entry to the front, and the iterator would walk it again.
	const expiring: [string, CatalogRow][] = [];
	for (const [key, row] of entries.entries()) {
		if (isInvalidatedBy({ row, orgId, env })) expiring.push([key, row]);
	}
	for (const [key, row] of expiring) {
		entries.set(key, row, { ttl: EXPIRED_TTL_MS });
	}
	return { expiredCount: expiring.length };
};
