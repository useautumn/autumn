import type { Migration, Operations } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import {
	recordMigrationCustomerEvent,
	recordMigrationFailedEvent,
	recordMigrationTerminalEvent,
} from "./events/index.js";
import { runPreparation, runScopeIteration } from "./orchestrators/index.js";
import { getRunScopes } from "./types/index.js";
import type {
	RunMigrationResponse,
	RunMigrationScopeResult,
} from "./types/runMigrationResponse.js";

/** Top-level migration run: prepare → per-scope filter+iterate → per-item ops. */
export const runMigration = async ({
	ctx,
	migration,
	dry_run,
	migrationRunId,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
	migrationRunId: string;
}): Promise<RunMigrationResponse> => {
	const scopeResults: RunMigrationScopeResult[] = [];

	try {
		return await executeMigrationRun({
			ctx,
			migration,
			dry_run,
			migrationRunId,
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
	dry_run,
	migrationRunId,
	scopeResults,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
	migrationRunId: string;
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

	const { response: prepareResponse, prepared_state } = await runPreparation({
		ctx,
		migration,
		dry_run,
	});

	const scope_id = `mig_${migration.internal_id}`;
	const operations: Operations = migration.operations ?? {};

	for (const kind of getRunScopes({ migration })) {
		const scopeResult = await runScopeIteration({
			ctx,
			migration,
			migrationRunId,
			dryRun: dry_run,
			kind,
			scope_id,
			operations,
			prepared_state,
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
