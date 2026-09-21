import {
	ACTIVE_MIGRATION_RUN_STATUSES,
	type MigrationRun,
	MigrationRunStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";

const ABANDONED_MESSAGE =
	"Run abandoned: the trigger task ended without settling this row";

export const settleAbandonedRun = async ({
	ctx,
	run,
	now,
}: {
	ctx: AutumnContext;
	run: MigrationRun;
	now: number;
}): Promise<boolean> => {
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
		if (!settled) return false;

		await settleLeftoverClaims({ ctx, migrationRunId: run.internal_id });
		ctx.logger.warn("migration-run: reconciled abandoned run", {
			data: {
				migrationRunId: run.internal_id,
				triggerRunId: run.trigger_run_id,
			},
		});
		return true;
	} catch (error) {
		ctx.logger.error("migration-run: failed to reconcile abandoned run", {
			data: {
				migrationRunId: run.internal_id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return false;
	}
};
