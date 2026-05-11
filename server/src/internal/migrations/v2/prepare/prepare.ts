import { hashJson } from "@/utils/hash/hashJson.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { migrationRepo } from "../repos/index.js";
import type { MigrationRuntime } from "../types/migrationDefinition.js";
import { isPersistedMigration } from "../types/migrationDefinition.js";
import { getImplicitPrepareModules } from "./getImplicitPrepareModules.js";
import { runPrepareModules } from "./runPrepareModules.js";
import type { PreparedState, PrepareResponse } from "./types/index.js";

const scopeIdFor = ({
	ctx,
	migration,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
}): string => {
	if (isPersistedMigration(migration)) return `mig_${migration.internal_id}`;

	return `migdef_${hashJson({
		value: { orgId: ctx.org.id, env: ctx.env, id: migration.id },
	})}`;
};

/** Runs implicit prep modules and persists state only for stored migrations. */
export const prepare = async ({
	ctx,
	migration,
	dryRun,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	dryRun: boolean;
}): Promise<{ response: PrepareResponse; preparedState: PreparedState }> => {
	const modules = getImplicitPrepareModules({
		operations: migration.operations,
	});

	const { results, preparedState } = await runPrepareModules({
		ctx,
		scopeId: scopeIdFor({ ctx, migration }),
		modules,
		dryRun,
	});

	if (!dryRun && isPersistedMigration(migration)) {
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
