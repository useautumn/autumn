import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { recordMigrationCustomerEvent } from "./recordMigrationCustomerEvent.js";

/** Records a failed run with partial scope progress. */
export const recordMigrationFailedEvent = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	error,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	error: unknown;
}): Promise<void> => {
	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		eventType: "migration_failed",
		details: {
			error: {
				message: error instanceof Error ? error.message : String(error),
			},
		},
	});
};
