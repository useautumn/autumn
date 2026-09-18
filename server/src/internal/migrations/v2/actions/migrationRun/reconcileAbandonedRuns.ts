import {
	ACTIVE_MIGRATION_RUN_STATUSES,
	type MigrationRun,
	MigrationRunStatus,
	ms,
	withTimeout,
} from "@autumn/shared";
import { differenceInMilliseconds } from "date-fns";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";
import { isTriggerRunTerminal } from "./triggerRunLiveness.js";

const ABANDONED_MESSAGE =
	"Run abandoned: the trigger task ended without settling this row";

const ABANDON_GRACE = ms.minutes(10);

const LIVENESS_TIMEOUT = ms.seconds(2);

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
	const age = (run: MigrationRun) =>
		differenceInMilliseconds(now, run.started_at ?? run.created_at);
	const candidates = runs.filter(
		(run) =>
			run.trigger_run_id !== null && !run.lazy_run && age(run) > ABANDON_GRACE,
	);

	const liveness = await Promise.all(
		candidates.map(async (run) => {
			const triggerRunId = run.trigger_run_id;
			if (!triggerRunId) return false;
			try {
				return await withTimeout({
					fn: () => isTerminal({ ctx, triggerRunId }),
					timeoutMs: LIVENESS_TIMEOUT,
					timeoutMessage: `trigger liveness check timed out for ${triggerRunId}`,
				});
			} catch (error) {
				ctx.logger.warn("migration-run: abandoned check failed", {
					data: {
						migrationRunId: run.internal_id,
						triggerRunId,
						error: error instanceof Error ? error.message : String(error),
					},
				});
				return false;
			}
		}),
	);

	for (const [index, run] of candidates.entries()) {
		if (!liveness[index]) continue;

		try {
			const settled = await migrationRunRepo.update({
				ctx,
				internalId: run.internal_id,
				updates: {
					status: MigrationRunStatus.Failed,
					error_message: ABANDONED_MESSAGE,
					finished_at: now,
				},
				onlyIfStatusIn: ACTIVE_MIGRATION_RUN_STATUSES,
			});
			if (!settled) continue;
			await settleLeftoverClaims({ ctx, migrationRunId: run.internal_id });
			reconciled.add(run.internal_id);
			ctx.logger.warn("migration-run: reconciled abandoned run", {
				data: {
					migrationRunId: run.internal_id,
					triggerRunId: run.trigger_run_id,
				},
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
