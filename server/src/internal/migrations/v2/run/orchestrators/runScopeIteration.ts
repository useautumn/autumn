import type { Migration, Operations } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import { runFilter } from "../../filters/runFilter.js";
import { recordMigrationCustomerEvent } from "../events/index.js";
import { runCustomerMigration } from "../perItem/runCustomerMigration.js";
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
	scope_id,
	operations,
	prepared_state,
}: {
	ctx: AutumnContext;
	migration: Migration;
	migrationRunId: string;
	dryRun: boolean;
	kind: RunScopeKind;
	scope_id: string;
	operations: Operations;
	prepared_state: PreparedState;
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

			return runCustomerMigration({
				ctx,
				migration,
				migrationRunId,
				dryRun,
				scope_id,
				operations,
				prepared_state,
				internalCustomerId: item.internal_id,
			});
		},
	});

	for (const result of summary.results) {
		if (result.status !== "failed") continue;

		await recordMigrationCustomerEvent({
			ctx,
			migration,
			migrationRunId,
			dryRun,
			eventType: "customer_failed",
			internalCustomerId: result.item.internal_id,
			customerId: result.item.id,
			details: {
				kind,
				error: {
					message: result.error.message,
				},
			},
		});
	}

	return { kind, count, summary };
};
