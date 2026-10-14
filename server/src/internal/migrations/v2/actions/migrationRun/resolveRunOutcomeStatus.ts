import { MigrationRunStatus } from "@autumn/shared";

export const resolveRunOutcomeStatus = ({
	succeeded,
	skipped,
	failed,
}: {
	succeeded: number;
	skipped: number;
	failed: number;
}): MigrationRunStatus =>
	skipped > 0 && succeeded === 0 && failed === 0
		? MigrationRunStatus.NoChanges
		: MigrationRunStatus.Succeeded;
