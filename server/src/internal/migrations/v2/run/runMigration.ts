import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	recordMigrationCustomerEvent,
	recordMigrationFailedEvent,
	recordMigrationTerminalEvent,
} from "./events/index.js";
import { prepare } from "../prepare/index.js";
import { runScopeIteration } from "./orchestrators/runScopeIteration.js";
import { getRunScopes } from "./types/getRunScopes.js";
import type {
	RunMigrationResponse,
	RunMigrationScopeResult,
} from "./types/runMigrationResponse.js";

/** Top-level migration run: prepare → per-scope filter+iterate → per-item ops. */
export const runMigration = async ({
	ctx,
	migration,
	migrationRunId,
	dry_run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dry_run: boolean;
}): Promise<RunMigrationResponse> => {
	const scopeResults: RunMigrationScopeResult[] = [];

	try {
		return await executeMigrationRun({
			ctx,
			migration,
			migrationRunId,
			dry_run,
			scopeResults,
		});
	} catch (error) {
		await recordMigrationFailedEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun: dry_run,
			error,
			scopeResults,
		});
		throw error;
	}
};

const executeMigrationRun = async ({
	ctx,
	migration,
	migrationRunId,
	dry_run,
	scopeResults,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dry_run: boolean;
	scopeResults: RunMigrationScopeResult[];
}): Promise<RunMigrationResponse> => {
	await recordMigrationCustomerEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun: dry_run,
		eventType: "migration_started",
		details: {
			migrationInternalId: migration.internal_id,
		},
	});

	const { response: prepareResponse, preparedState } = await prepare({
		ctx,
		migration,
		dryRun: dry_run,
	});
	const preparedMigration = { ...migration, prepared_state: preparedState };

	for (const kind of getRunScopes({ migration: preparedMigration })) {
		const scopeResult = await runScopeIteration({
			ctx,
			migration: preparedMigration,
			migrationRunId,
			dryRun: dry_run,
			kind,
		});
		scopeResults.push(scopeResult);
	}

	await recordMigrationTerminalEvent({
		ctx,
		migration,
		migrationRunId,
		dryRun: dry_run,
		scopeResults,
	});

	return {
		migration_id: migration.id,
		dry_run,
		prepare_warnings: prepareResponse.warnings,
		scopes: scopeResults,
	};
};
