import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { listMigrationStatuses } from "../actions/migrationStatus/listMigrationStatuses.js";
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
		const [runs, statuses] = await Promise.all([
			migrationRunRepo.list({
				ctx,
				migrationInternalId: migration.internal_id,
			}),
			listMigrationStatuses({ ctx, migrations: [migration] }),
		]);
		const statusInfo = statuses.get(migration.internal_id);
		// A scoped run (single customer / sample) is counted on its own rows, so
		// its progress reads out of what it is actually running. An unscoped Run
		// All keeps the migration-wide count: re-runs reuse item rows and move
		// `migration_run_id`, so per-run counting would undercount a resumed run.
		const isScoped = (run: (typeof runs)[number]) =>
			run.only_ids !== null || run.target_limit !== null;
		const perRunIds = runs
			.filter((run) => run.dry_run || isScoped(run))
			.map((run) => run.internal_id);
		const hasUnscopedLiveRun = runs.some(
			(run) => !run.dry_run && !isScoped(run),
		);

		const countRows = await migrationItemRunRepo.listCountsByRun({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunIds: perRunIds,
		});
		const liveCounts = hasUnscopedLiveRun
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
			const counts =
				run.dry_run || isScoped(run)
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

		return c.json({
			list: runsWithCounts,
			status: statusInfo?.status ?? "draft",
			blocked_by: statusInfo?.blocked_by ?? null,
		});
	},
});
