import {
	type MigrationRun,
	MigrationRunStatus,
	MigrationStatus,
} from "@autumn/shared";

export type ResolvedMigrationStatus = {
	status: MigrationStatus;
	blockedByMigrationInternalId: string | null;
};

/** A Run All is a live run over the whole filter: single-customer runs
 * (`only_ids`) and Run Sample (`target_limit`) never change status. */
export const isRunAllMigrationRun = (run: MigrationRun): boolean =>
	!run.dry_run && run.only_ids === null && run.target_limit === null;

const isActive = (run: MigrationRun): boolean =>
	run.status === MigrationRunStatus.Queued ||
	run.status === MigrationRunStatus.Running;

const hasStartedExecuting = (run: MigrationRun): boolean =>
	run.started_at !== null;

const findBlockingRun = ({
	migrationInternalId,
	orgActiveRuns,
}: {
	migrationInternalId: string;
	orgActiveRuns: MigrationRun[];
}): MigrationRun | undefined =>
	orgActiveRuns.find(
		(run) =>
			run.migration_internal_id !== migrationInternalId &&
			!run.dry_run &&
			run.status === MigrationRunStatus.Running,
	);

/** Status is derived on read from migration_runs; nothing is stored on the
 * migration row. `orgActiveRuns` are the org/env's queued+running runs;
 * `hasStartedRunAll` lets callers pass a pre-aggregated history instead of
 * every finished run. */
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
}): ResolvedMigrationStatus => {
	const runAllRuns = runs.filter(isRunAllMigrationRun);
	const activeRunAll = runAllRuns.find(isActive);

	if (activeRunAll) {
		const isQueued = activeRunAll.status === MigrationRunStatus.Queued;
		const blocker = isQueued
			? findBlockingRun({ migrationInternalId, orgActiveRuns })
			: undefined;
		if (blocker) {
			return {
				status: MigrationStatus.Waiting,
				blockedByMigrationInternalId: blocker.migration_internal_id,
			};
		}
		return {
			status: MigrationStatus.Running,
			blockedByMigrationInternalId: null,
		};
	}

	if (hasStartedRunAll || runAllRuns.some(hasStartedExecuting)) {
		return { status: MigrationStatus.Run, blockedByMigrationInternalId: null };
	}

	return { status: MigrationStatus.Draft, blockedByMigrationInternalId: null };
};
