import { type MigrationRun, MigrationRunStatus, ms } from "@autumn/shared";
import { differenceInMilliseconds } from "date-fns";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";
import { isTriggerRunTerminal } from "./triggerRunLiveness.js";

const ABANDONED_MESSAGE =
	"Run abandoned: the trigger task ended without settling this row";

/** A trigger handle exists from dispatch, so a young run is not yet evidence. */
const ABANDON_GRACE = ms.minutes(10);

/** Settles runs whose trigger task is provably dead. Only a confirmed-terminal
 * run settles: releasing a live run's claim would double-process its customers. */
export const reconcileAbandonedRuns = async ({
	ctx,
	runs,
	isTerminal = isTriggerRunTerminal,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	runs: MigrationRun[];
	isTerminal?: (params: {
		ctx: AutumnContext;
		triggerRunId: string;
	}) => Promise<boolean>;
	now?: number;
}): Promise<Set<string>> => {
	const reconciled = new Set<string>();
	const candidates = runs.filter(
		(run) =>
			run.trigger_run_id !== null &&
			!run.lazy_run &&
			differenceInMilliseconds(now, run.started_at ?? run.created_at) >
				ABANDON_GRACE,
	);

	for (const run of candidates) {
		const triggerRunId = run.trigger_run_id;
		if (!triggerRunId) continue;

		let terminal = false;
		try {
			terminal = await isTerminal({ ctx, triggerRunId });
		} catch (error) {
			ctx.logger.warn("migration-run: abandoned check failed", {
				data: {
					migrationRunId: run.internal_id,
					triggerRunId,
					error: error instanceof Error ? error.message : String(error),
				},
			});
			continue;
		}
		if (!terminal) continue;

		try {
			await migrationRunRepo.update({
				ctx,
				internalId: run.internal_id,
				updates: {
					status: MigrationRunStatus.Failed,
					error_message: ABANDONED_MESSAGE,
					finished_at: now,
				},
			});
			await settleLeftoverClaims({ ctx, migrationRunId: run.internal_id });
			reconciled.add(run.internal_id);
			ctx.logger.warn("migration-run: reconciled abandoned run", {
				data: { migrationRunId: run.internal_id, triggerRunId },
			});
		} catch (error) {
			ctx.logger.error("migration-run: failed to reconcile abandoned run", {
				data: {
					migrationRunId: run.internal_id,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	return reconciled;
};
