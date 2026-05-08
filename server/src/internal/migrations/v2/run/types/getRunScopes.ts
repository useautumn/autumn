import type { Migration } from "@autumn/shared";
import type { RunScopeKind } from "./runScope.js";

/** Returns active run scopes from top-level migration operations. */
export const getRunScopes = ({
	migration,
}: {
	migration: Migration;
}): RunScopeKind[] => {
	const scopes: RunScopeKind[] = [];
	if (migration.operations?.customer) scopes.push("customer");
	// future: if (migration.operations?.plan) scopes.push("plan");
	return scopes;
};
