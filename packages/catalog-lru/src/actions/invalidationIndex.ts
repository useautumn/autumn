import type { CatalogRow } from "@autumn/balance-engine";
import type { KeysByInvalidationScope } from "../types/catalogCacheContext.js";

/** Entitlements and prices carry no env, so an org's edit in any env reaches them; custom ones belong to one customer and are never edited. */
const scopeOf = ({ row }: { row: CatalogRow }): string | null => {
	switch (row.table) {
		case "entitlements":
		case "prices":
			if (row.row.is_custom || !row.row.org_id) return null;
			return orgScope({ orgId: row.row.org_id });
		case "products":
		case "features":
		case "planLicenses":
			return orgEnvScope({ orgId: row.row.org_id, env: row.row.env });
	}
};

export const orgScope = ({ orgId }: { orgId: string }): string =>
	`org:${orgId}`;

export const orgEnvScope = ({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}): string => `org:${orgId}|env:${env}`;

export const indexCatalogRow = ({
	keysByScope,
	key,
	row,
}: {
	keysByScope: KeysByInvalidationScope;
	key: string;
	row: CatalogRow;
}): void => {
	const scope = scopeOf({ row });
	if (!scope) return;
	const keys = keysByScope.get(scope) ?? new Set<string>();
	keys.add(key);
	keysByScope.set(scope, keys);
};

export const unindexCatalogRow = ({
	keysByScope,
	key,
	row,
}: {
	keysByScope: KeysByInvalidationScope;
	key: string;
	row: CatalogRow;
}): void => {
	const scope = scopeOf({ row });
	if (!scope) return;
	const keys = keysByScope.get(scope);
	keys?.delete(key);
	if (keys?.size === 0) keysByScope.delete(scope);
};
