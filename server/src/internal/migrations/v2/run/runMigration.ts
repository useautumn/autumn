import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { generateId } from "../../../../utils/genUtils.js";
import type {
	MigrationBatchFn,
	MigrationRunControls,
} from "../cloudAdapter/types.js";
import {
	composeMigrationHooks,
	type MigrationHooks as RunMigrationHooks,
	type MigrationPlugin as RunMigrationPlugin,
} from "../hooks/index.js";
import { prepare } from "../prepare/index.js";
import {
	type MigrationRuntime,
	type MigrationRuntimeWithEventId,
	withMigrationEventId,
} from "../types/migrationDefinition.js";
import type { IterateScopeCompletion } from "./orchestrators/iterateScope.js";
import { runScopeIteration } from "./orchestrators/runScopeIteration.js";
import { preProcessMigration } from "./preProcess/index.js";
import { getRunScopes } from "./types/getRunScopes.js";
import type { MigrationRunScheduler } from "./types/migrationRunScheduler.js";

export type RunMigrationResult = {
	processed: number;
	completion: IterateScopeCompletion;
	cursor: string | null;
};

export const prepareMigration = async ({
	ctx,
	migration,
	dryRun,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	dryRun: boolean;
}): Promise<MigrationRuntimeWithEventId> => {
	const migrationWithEventId = withMigrationEventId({
		orgId: ctx.org.id,
		env: ctx.env,
		migration,
	});
	const guardedMigration = preProcessMigration(migrationWithEventId);
	const { preparedState } = await prepare({
		ctx,
		migration: guardedMigration,
		dryRun,
	});

	return {
		...guardedMigration,
		prepared_state: preparedState,
	};
};

export const runPreparedMigration = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	batch,
	controls,
	hooks,
	scheduler,
	includeFilterCount = true,
	afterInternalId,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationRunId: string;
	dryRun: boolean;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: RunMigrationHooks;
	scheduler?: MigrationRunScheduler;
	includeFilterCount?: boolean;
	afterInternalId?: string;
}): Promise<RunMigrationResult> => {
	let processed = 0;
	let cursor: string | null = null;

	for (const kind of getRunScopes({ migration })) {
		const result = await runScopeIteration({
			ctx,
			migration,
			migrationRunId,
			dryRun,
			kind,
			batch,
			controls,
			hooks,
			scheduler,
			includeFilterCount,
			afterInternalId,
		});
		if (!result) continue;
		processed += result.processed;
		cursor = result.cursor;

		if ("completion" in result && result.completion !== "exhausted") {
			return { processed, completion: result.completion, cursor };
		}
	}

	return { processed, completion: "exhausted", cursor };
};

/** Top-level migration run: prepare -> per-scope filter+iterate -> per-item ops. */
export const runMigration = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	batch,
	controls,
	hooks,
	plugins,
	scheduler,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	migrationRunId?: string;
	dryRun: boolean;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: RunMigrationHooks;
	plugins?: RunMigrationPlugin[];
	scheduler?: MigrationRunScheduler;
}): Promise<RunMigrationResult> => {
	const eventMigrationRunId = migrationRunId ?? generateId("mrun");
	const migrationHooks = composeMigrationHooks({ hooks, plugins });
	const preparedMigration = await prepareMigration({
		ctx,
		migration,
		dryRun,
	});

	return runPreparedMigration({
		ctx,
		migration: preparedMigration,
		migrationRunId: eventMigrationRunId,
		dryRun,
		batch,
		controls,
		hooks: migrationHooks,
		scheduler,
	});
};

export type { RunMigrationHooks, RunMigrationPlugin };
