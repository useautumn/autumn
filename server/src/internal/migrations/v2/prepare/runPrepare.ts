import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { migrationRepo } from "../repos/index.js";
import { inferImplicitPrep } from "./inferImplicitPrep.js";
import type {
	PrepareModuleResult,
	PrepareResponse,
	PreparedState,
} from "./types/index.js";

/**
 * Orchestrate a migration's prepare phase. Walks implicit prep modules,
 * runs plan → apply per module, persists prepared_state.
 *
 * On `dry_run: true`, plan runs but apply is skipped and prepared_state
 * is not written.
 */
export const runPrepare = async ({
	ctx,
	migration,
	dry_run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dry_run: boolean;
}): Promise<PrepareResponse> => {
	const instances = inferImplicitPrep(migration);
	const warnings: string[] = [];
	const modules: PrepareModuleResult[] = [];
	const nextState: PreparedState = { ...(migration.prepared_state ?? {}) };

	for (const { key, module, input } of instances) {
		const planned = await module.plan({ ctx, migration, input });

		if (planned.entitlements.length === 0) {
			warnings.push(`No products matched target for ${key}`);
		}

		const result = dry_run
			? planned
			: await module.apply({ ctx, migration, input, planned });

		if (!dry_run) nextState[key] = result;

		modules.push({ key, kind: module.kind, result });
	}

	if (!dry_run) {
		await migrationRepo.update({
			ctx,
			id: migration.id,
			updates: { prepared_state: nextState },
		});
	}

	return {
		migration_id: migration.id,
		dry_run,
		modules,
		warnings,
	};
};
