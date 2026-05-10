import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { prepare } from "../prepare/index.js";
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
};
