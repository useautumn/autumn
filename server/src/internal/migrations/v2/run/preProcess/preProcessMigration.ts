import type { MigrationRuntime } from "../../types/migrationDefinition.js";
import { preProcessMigrationFilter } from "./preProcessMigrationFilter.js";
import { preProcessMigrationOperations } from "./preProcessMigrationOperations.js";

export const preProcessMigration = <M extends MigrationRuntime>(
	migration: M,
): M => {
	const operations = migration.operations
		? preProcessMigrationOperations({
				operations: migration.operations,
				filter: migration.filter,
			})
		: migration.operations;
	const filter = preProcessMigrationFilter({
		operations: operations ?? undefined,
		filter: migration.filter,
	});
	return { ...migration, operations, filter };
};
