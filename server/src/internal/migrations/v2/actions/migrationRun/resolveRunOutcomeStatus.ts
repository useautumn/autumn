import { MigrationRunStatus } from "@autumn/shared";

/** A run that completed items but changed none of them is reported as
 * `no_changes`, so a mis-targeted filter is not indistinguishable from a real
 * migration. A run that claimed nothing stays `succeeded`: "no customers
 * matched" is a filter result, not a no-op run. */
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
