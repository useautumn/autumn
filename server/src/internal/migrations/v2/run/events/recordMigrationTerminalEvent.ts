import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { recordMigrationCustomerEvent } from "./recordMigrationCustomerEvent.js";

/** Records the final run event after all scopes finish. */
export const recordMigrationTerminalEvent = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
}): Promise<void> => {
	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		eventType: "migration_succeeded",
	});
};
