import type { MigrationCustomerEventType } from "./migrationCustomerEventTypes.js";

/** Returns the terminal event type for a migration run summary. */
export const getMigrationRunEventType = ({
	scopes,
}: {
	scopes: { succeeded: number; failed: number }[];
}): MigrationCustomerEventType => {
	const succeeded = scopes.reduce((sum, scope) => sum + scope.succeeded, 0);
	const failed = scopes.reduce((sum, scope) => sum + scope.failed, 0);

	if (failed === 0) return "migration_succeeded";
	if (succeeded === 0) return "migration_failed";
	return "migration_partially_failed";
};
