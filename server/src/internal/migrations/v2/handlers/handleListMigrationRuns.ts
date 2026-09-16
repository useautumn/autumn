import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	migrationItemRunRepo,
	migrationRepo,
	migrationRunRepo,
} from "../repos/index.js";

const ListMigrationRunsBody = z.object({
	migrationId: z.string(),
});

export const handleListMigrationRuns = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: ListMigrationRunsBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { migrationId } = c.req.valid("json");
		const migration = await migrationRepo.find({ ctx, id: migrationId });
		const runs = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
		});
		const dryRunIds = runs
			.filter((run) => run.dry_run)
			.map((run) => run.internal_id);
		const hasLiveRuns = runs.some((run) => !run.dry_run);

		const countRows = await migrationItemRunRepo.listCountsByRun({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunIds: dryRunIds,
		});
		const liveCounts = hasLiveRuns
			? await migrationItemRunRepo.getCounts({
					ctx,
					migrationInternalId: migration.internal_id,
					dryRun: false,
				})
			: null;
		const countsByRunId = new Map(
			countRows.map((row) => [row.migration_run_id, row]),
		);
		const runsWithCounts = runs.map((run) => {
			const counts = run.dry_run
				? countsByRunId.get(run.internal_id)
				: liveCounts;
			const succeeded = counts?.succeeded ?? 0;
			const skipped = counts?.skipped ?? 0;
			const failed = counts?.failed ?? 0;

			return {
				...run,
				item_run_counts: {
					total: counts?.total ?? 0,
					running: counts?.running ?? 0,
					succeeded,
					skipped,
					failed,
					completed: succeeded + skipped + failed,
				},
			};
		});

		return c.json({ list: runsWithCounts });
	},
});
