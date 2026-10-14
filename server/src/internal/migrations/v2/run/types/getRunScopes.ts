import type { MigrationRuntime } from "../../types/migrationDefinition.js";
import type { RunScopeKind } from "./runScope.js";

export const getRunScopes = ({
	migration,
}: {
	migration: MigrationRuntime;
}): RunScopeKind[] => {
	const scopes: RunScopeKind[] = [];
	if (migration.operations?.customer) scopes.push("customer");
	return scopes;
};
