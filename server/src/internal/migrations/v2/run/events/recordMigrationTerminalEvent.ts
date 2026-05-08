import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunMigrationScopeResult } from "../types/runMigrationResponse.js";
import { getMigrationRunEventType } from "./getMigrationRunEventType.js";
import { getScopeEventSummaries } from "./getScopeEventSummaries.js";
import { recordMigrationCustomerEvent } from "./recordMigrationCustomerEvent.js";

/** Records the final run event after all scopes finish. */
export const recordMigrationTerminalEvent = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	scopeResults,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	scopeResults: RunMigrationScopeResult[];
}): Promise<void> => {
	const scopes = getScopeEventSummaries({ scopeResults });

	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
		eventType: getMigrationRunEventType({ scopes }),
		details: {
			scopes,
		},
	});
};
