import {
	type MigrationRun,
	MigrationRunStatus,
	MigrationStatus,
} from "@autumn/shared";

/** A Run All is a live run over the whole filter; `only_ids` and
 * `target_limit` runs never change status. */
const isRunAll = (run: MigrationRun): boolean =>
	!run.dry_run && run.only_ids === null && run.target_limit === null;

const isActive = (run: MigrationRun): boolean =>
	run.status === MigrationRunStatus.Queued ||
	run.status === MigrationRunStatus.Running;

export const resolveMigrationStatus = ({
	migrationInternalId,
	runs,
	orgActiveRuns,
	hasStartedRunAll = false,
}: {
	migrationInternalId: string;
	runs: MigrationRun[];
	orgActiveRuns: MigrationRun[];
	hasStartedRunAll?: boolean;
}): {
	status: MigrationStatus;
	blockedByMigrationInternalId: string | null;
} => {
	const runAllRuns = runs.filter(isRunAll);
	const activeRunAll = runAllRuns.find(isActive);

	if (activeRunAll) {
		const blocker =
			activeRunAll.status === MigrationRunStatus.Queued
				? orgActiveRuns.find(
						(run) =>
							run.migration_internal_id !== migrationInternalId &&
							!run.dry_run &&
							run.status === MigrationRunStatus.Running,
					)
				: undefined;
		return blocker
			? {
					status: MigrationStatus.Waiting,
					blockedByMigrationInternalId: blocker.migration_internal_id,
				}
			: { status: MigrationStatus.Running, blockedByMigrationInternalId: null };
	}

	const started =
		hasStartedRunAll || runAllRuns.some((run) => run.started_at !== null);
	return {
		status: started ? MigrationStatus.Run : MigrationStatus.Draft,
		blockedByMigrationInternalId: null,
	};
};
