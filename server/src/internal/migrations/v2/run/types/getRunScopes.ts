import type { MigrationRuntime } from "../../types/migrationDefinition.js";
import type { RunScopeKind } from "./runScope.js";

/** Returns active run scopes from top-level migration operations. */
export const getRunScopes = ({
	migration,
}: {
	migration: MigrationRuntime;
}): RunScopeKind[] => {
	const scopes: RunScopeKind[] = [];
	if (migration.operations?.customer) scopes.push("customer");
	// future: if (migration.operations?.plan) scopes.push("plan");
	return scopes;
};
