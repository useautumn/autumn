import type { MigrationRuntime } from "../../types/migrationDefinition.js";
import { preProcessMigrationFilter } from "./preProcessMigrationFilter.js";
import { preProcessMigrationOperations } from "./preProcessMigrationOperations.js";

/**
 * Apply every default-guard transform to a migration before it runs.
 *
 * - Operation-level: any update_plan op bumping `version` gets
 *   `plan_filter.custom: false` injected (see preProcessMigrationOperations).
 * - Filter-level: when any such op is present, `custom: false` is pushed
 *   into the customer-scope plan filter so the SQL query never even
 *   fetches admin-customized cusProducts (see preProcessMigrationFilter).
 *
 * Pure transform — never mutates the input.
 */
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
