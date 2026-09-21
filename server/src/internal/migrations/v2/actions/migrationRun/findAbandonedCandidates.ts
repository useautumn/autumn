import { type MigrationRun, ms } from "@autumn/shared";
import { differenceInMilliseconds } from "date-fns";

const ABANDON_GRACE = ms.minutes(10);

export const findAbandonedCandidates = ({
	runs,
	now,
}: {
	runs: MigrationRun[];
	now: number;
}): MigrationRun[] =>
	runs.filter(
		(run) =>
			run.trigger_run_id !== null &&
			!run.lazy_run &&
			differenceInMilliseconds(now, run.started_at ?? run.created_at) >
				ABANDON_GRACE,
	);
