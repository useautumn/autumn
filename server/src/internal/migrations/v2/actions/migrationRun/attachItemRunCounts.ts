import type { MigrationRun } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";
import { isRunAll } from "../../utils/migrationRunKind.js";

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
		.filter((run) => !isRunAll(run))
		.map((run) => run.internal_id);
	const hasRunAll = runs.some(isRunAll);

	const [countRows, liveCounts] = await Promise.all([
		migrationItemRunRepo.listCountsByRun({
			ctx,
			migrationInternalId,
			migrationRunIds: perRunIds,
		}),
		hasRunAll
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
		const counts = isRunAll(run)
			? liveCounts
			: countsByRunId.get(run.internal_id);
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
