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
	withMigrationEventId,
} from "../types/migrationDefinition.js";
import { runScopeIteration } from "./orchestrators/runScopeIteration.js";
import { getRunScopes } from "./types/getRunScopes.js";

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
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	migrationRunId?: string;
	dryRun: boolean;
	batch?: MigrationBatchFn;
	controls?: MigrationRunControls;
	hooks?: RunMigrationHooks;
	plugins?: RunMigrationPlugin[];
}): Promise<void> => {
	const eventMigrationRunId = migrationRunId ?? generateId("mrun");
	const migrationHooks = composeMigrationHooks({ hooks, plugins });
	const migrationWithEventId = withMigrationEventId({
		orgId: ctx.org.id,
		env: ctx.env,
		migration,
	});

	const { preparedState } = await prepare({
		ctx,
		migration: migrationWithEventId,
		dryRun,
	});
	const preparedMigration = {
		...migrationWithEventId,
		prepared_state: preparedState,
	};

	for (const kind of getRunScopes({ migration: preparedMigration })) {
		await runScopeIteration({
			ctx,
			migration: preparedMigration,
			migrationRunId: eventMigrationRunId,
			dryRun,
			kind,
			batch,
			controls,
			hooks: migrationHooks,
		});
	}
};

export type { RunMigrationHooks, RunMigrationPlugin };
