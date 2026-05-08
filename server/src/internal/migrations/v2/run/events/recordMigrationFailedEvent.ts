import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunMigrationScopeResult } from "../types/runMigrationResponse.js";
import { getScopeEventSummaries } from "./getScopeEventSummaries.js";
import { recordMigrationCustomerEvent } from "./recordMigrationCustomerEvent.js";

/** Records a failed run with partial scope progress. */
export const recordMigrationFailedEvent = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	error,
	scopeResults,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	error: unknown;
	scopeResults: RunMigrationScopeResult[];
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
			scopes: getScopeEventSummaries({ scopeResults }),
		},
	});
};
