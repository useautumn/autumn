import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runFilter } from "../../filters/runFilter.js";
import { migrateCustomer } from "../migrateCustomer/index.js";
import type { RunMigrationScopeResult } from "../types/runMigrationResponse.js";
import type { RunScopeKind } from "../types/runScope.js";
import { iterateScope } from "./iterateScope.js";

/** Runs one filtered migration scope iteration. */
export const runScopeIteration = async ({
	ctx,
	migration,
	migrationRunId,
	dryRun,
	kind,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
}): Promise<RunMigrationScopeResult> => {
	const { count, iterate } = await runFilter({ ctx, migration, kind });
	ctx.logger.info(`run-migration: iterating scope`, {
		data: { kind, count, dryRun },
	});

	const summary = await iterateScope({
		iterate,
		perItem: async (item) => {
			if (item.kind !== "customer")
				throw new Error(
					`runMigration: per-item handler missing for kind "${item.kind}"`,
				);

			return migrateCustomer({
				ctx,
				customerId: item.internal_id,
				migration,
				migrationRunId,
				preview: dryRun,
			});
		},
	});

	return { kind, count, summary };
};
