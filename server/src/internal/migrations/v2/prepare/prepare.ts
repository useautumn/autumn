import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { migrationRepo } from "../repos/index.js";
import { getImplicitPrepareModules } from "./getImplicitPrepareModules.js";
import { runPrepareModules } from "./runPrepareModules.js";
import type { PreparedState, PrepareResponse } from "./types/index.js";

/** Stable scopeId for a Migration. Preserves the historical entitlement ID format. */
const scopeIdFor = (migration: Migration): string =>
	`mig_${migration.internal_id}`;

/**
 * Migration-fed shim around `runPrepareModules`. Walks implicit prep
 * modules from `migration.operations`, runs the pure orchestrator, then
 * persists the new `preparedState` back to the migrations row (skipped
 * on dry-run).
 */
export const prepare = async ({
	ctx,
	migration,
	dryRun,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dryRun: boolean;
}): Promise<{ response: PrepareResponse; preparedState: PreparedState }> => {
	const modules = getImplicitPrepareModules({
		operations: migration.operations,
	});

	const { results, preparedState } = await runPrepareModules({
		ctx,
		scopeId: scopeIdFor(migration),
		modules,
		dryRun,
	});

	if (!dryRun) {
		await migrationRepo.update({
			ctx,
			id: migration.id,
			updates: { prepared_state: preparedState },
		});
	}

	return {
		response: {
			migration_id: migration.id,
			dry_run: dryRun,
			modules: results,
			warnings: [],
		},
		preparedState,
	};
};
