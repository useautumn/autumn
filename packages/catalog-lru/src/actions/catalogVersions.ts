import type { CatalogRow } from "@autumn/balance-engine";
import type { CatalogCacheScope } from "../types/catalogCacheContext.js";
import { orgEnvScope, orgScope, scopeOf } from "./invalidationIndex.js";

export const catalogVersionOf = ({
	scope,
	row,
}: {
	scope: CatalogCacheScope;
	row: CatalogRow;
}): number => {
	const rowScope = scopeOf({ row });
	return rowScope ? (scope.state.catalogVersions.get(rowScope) ?? 0) : 0;
};

export const snapshotCatalogVersions = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): ((params: { row: CatalogRow }) => number) => {
	const atStart = new Map(
		[orgScope({ orgId }), orgEnvScope({ orgId, env })].map((key) => [
			key,
			scope.state.catalogVersions.get(key) ?? 0,
		]),
	);
	return ({ row }) => {
		const rowScope = scopeOf({ row });
		return rowScope ? (atStart.get(rowScope) ?? 0) : 0;
	};
};

export const bumpCatalogVersions = ({
	scope,
	orgId,
	env,
}: {
	scope: CatalogCacheScope;
	orgId: string;
	env: string;
}): void => {
	const { catalogVersions } = scope.state;
	scope.state.changeCount += 1;
	for (const invalidated of [orgScope({ orgId }), orgEnvScope({ orgId, env })])
		catalogVersions.set(
			invalidated,
			(catalogVersions.get(invalidated) ?? 0) + 1,
		);
};

export const isCatalogRowCurrent = ({
	scope,
	row,
}: {
	scope: CatalogCacheScope;
	row: CatalogRow;
}): boolean =>
	(scope.state.rowVersions.get(row) ?? 0) >= catalogVersionOf({ scope, row });
