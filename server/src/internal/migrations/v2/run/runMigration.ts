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
import { preProcessMigration } from "./preProcess/index.js";
import { getRunScopes } from "./types/getRunScopes.js";
import type { MigrationRunScheduler } from "./types/migrationRunScheduler.js";

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
}): Promise<void> => {
	const eventMigrationRunId = migrationRunId ?? generateId("mrun");
	const migrationHooks = composeMigrationHooks({ hooks, plugins });
	const migrationWithEventId = withMigrationEventId({
		orgId: ctx.org.id,
		env: ctx.env,
		migration,
	});

	// Inject default guards (e.g. `custom: false` on version-bumping
	// update_plan ops, both at the op-level plan_filter and at the
	// migration.filter customer.plan level) so admin-customized
	// customer_products are never touched. Has to run before `prepare`
	// so the prepared state reflects the guarded filter.
	const guardedMigration = preProcessMigration(migrationWithEventId);

	const { preparedState } = await prepare({
		ctx,
		migration: guardedMigration,
		dryRun,
	});
	const preparedMigration = {
		...guardedMigration,
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
			scheduler,
		});
	}
};

export type { RunMigrationHooks, RunMigrationPlugin };
