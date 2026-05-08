import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { migrationRepo } from "../repos/index.js";
import { inferImplicitPrep } from "./inferImplicitPrep.js";
import { runPrepareModules } from "./runPrepareModules.js";
import type { PreparedState, PrepareResponse } from "./types/index.js";

/** Stable scope_id for a Migration. Preserves the historical entitlement ID format. */
const scopeIdFor = (migration: Migration): string =>
	`mig_${migration.internal_id}`;

/**
 * Migration-fed shim around `runPrepareModules`. Walks implicit prep
 * modules from `migration.operations`, runs the pure orchestrator, then
 * persists the new `prepared_state` back to the migrations row (skipped
 * on dry-run).
 */
export const runPrepare = async ({
	ctx,
	migration,
	dry_run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
}): Promise<{ response: PrepareResponse; prepared_state: PreparedState }> => {
	const modules = inferImplicitPrep(migration);

	const { results, prepared_state } = await runPrepareModules({
		ctx,
		scope_id: scopeIdFor(migration),
		modules,
		dry_run,
		prior_state: migration.prepared_state ?? {},
	});

	if (!dry_run) {
		await migrationRepo.update({
			ctx,
			id: migration.id,
			updates: { prepared_state },
		});
	}

	return {
		response: {
			migration_id: migration.id,
			dry_run,
			modules: results,
			warnings: [],
		},
		prepared_state,
	};
};
