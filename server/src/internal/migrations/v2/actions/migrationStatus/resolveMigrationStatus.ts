import {
	type MigrationRun,
	MigrationRunStatus,
	MigrationStatus,
} from "@autumn/shared";
import { isRunAll } from "../../utils/migrationRunKind.js";
import type { MigrationRunState } from "./types/migrationRunState.js";

const outcomeStatus = (status: MigrationRunStatus): MigrationStatus => {
	if (status === MigrationRunStatus.Succeeded) return MigrationStatus.Run;
	if (
		status === MigrationRunStatus.Queued ||
		status === MigrationRunStatus.Running
	)
		return MigrationStatus.Running;
	return status;
};

const isActive = (run: MigrationRun): boolean =>
	run.status === MigrationRunStatus.Queued ||
	run.status === MigrationRunStatus.Running;

export const resolveMigrationStatus = ({
	migrationInternalId,
	runs,
	orgActiveRuns,
}: {
	migrationInternalId: string;
	runs: MigrationRun[];
	orgActiveRuns: MigrationRun[];
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

	const latestStartedRunAll = runAllRuns
		.filter((run) => run.started_at !== null)
		.reduce<MigrationRun | null>(
			(latest, run) =>
				latest === null || run.created_at > latest.created_at ? run : latest,
			null,
		);
	if (!latestStartedRunAll)
		return {
			status: MigrationStatus.Draft,
			blockedByMigrationInternalId: null,
		};

	return {
		status: outcomeStatus(latestStartedRunAll.status),
		blockedByMigrationInternalId: null,
	};
};

export const resolveMigrationStatusFromRunState = ({
	migrationInternalId,
	runState: { orgActiveRuns, latestRuns },
}: {
	migrationInternalId: string;
	runState: MigrationRunState;
}) =>
	resolveMigrationStatus({
		migrationInternalId,
		runs: [...orgActiveRuns, ...latestRuns].filter(
			(run) => run.migration_internal_id === migrationInternalId,
		),
		orgActiveRuns,
	});
