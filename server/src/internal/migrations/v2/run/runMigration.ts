import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { prepare } from "../prepare/index.js";
import {
	recordMigrationCustomerEvent,
	recordMigrationFailedEvent,
	recordMigrationTerminalEvent,
} from "./events/index.js";
import { runScopeIteration } from "./orchestrators/runScopeIteration.js";
import { getRunScopes } from "./types/getRunScopes.js";

/** Top-level migration run: prepare → per-scope filter+iterate → per-item ops. */
export const runMigration = async ({
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
	try {
		await executeMigrationRun({
			ctx,
			migration,
			migrationRunId,
			dryRun,
		});
	} catch (error) {
		await recordMigrationFailedEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun,
			error,
		});
		throw error;
	}
};

const executeMigrationRun = async ({
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
		eventType: "migration_started",
		details: {
			migrationInternalId: migration.internal_id,
		},
	});

	const { preparedState } = await prepare({
		ctx,
		migration,
		dryRun,
	});
	const preparedMigration = { ...migration, prepared_state: preparedState };

	for (const kind of getRunScopes({ migration: preparedMigration })) {
		await runScopeIteration({
			ctx,
			migration: preparedMigration,
			migrationRunId,
			dryRun,
			kind,
		});
	}

	await recordMigrationTerminalEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun,
	});
};
