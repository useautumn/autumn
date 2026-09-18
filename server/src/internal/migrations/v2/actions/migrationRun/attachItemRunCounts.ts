import type { MigrationRun } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";

export type MigrationRunWithCounts = MigrationRun & {
	item_run_counts: {
		total: number;
		running: number;
		succeeded: number;
		skipped: number;
		failed: number;
		completed: number;
	};
};

/** Scoped runs (single customer / sample) are counted on their own rows.
 * Unscoped runs keep the migration-wide count, because a re-run reuses item
 * rows and moves `migration_run_id`. */
const isScoped = (run: MigrationRun) =>
	run.only_ids !== null || run.target_limit !== null;

export const attachItemRunCounts = async ({
	ctx,
	migrationInternalId,
	runs,
}: {
	ctx: AutumnContext;
	migrationInternalId: string;
	runs: MigrationRun[];
}): Promise<MigrationRunWithCounts[]> => {
	const perRunIds = runs
		.filter((run) => run.dry_run || isScoped(run))
		.map((run) => run.internal_id);
	const hasUnscopedLiveRun = runs.some((run) => !run.dry_run && !isScoped(run));

	const [countRows, liveCounts] = await Promise.all([
		migrationItemRunRepo.listCountsByRun({
			ctx,
			migrationInternalId,
			migrationRunIds: perRunIds,
		}),
		hasUnscopedLiveRun
			? migrationItemRunRepo.getCounts({
					ctx,
					migrationInternalId,
					dryRun: false,
				})
			: null,
	]);
	const countsByRunId = new Map(
		countRows.map((row) => [row.migration_run_id, row]),
	);

	return runs.map((run) => {
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
};
