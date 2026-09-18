import { MigrationRunStatus } from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRunRepo } from "../../repos/index.js";

export type PersistTriggerRunId = (params: {
	ctx: AutumnContext;
	migrationRunId: string;
	triggerRunId: string;
}) => Promise<unknown>;

export const defaultPersistTriggerRunId: PersistTriggerRunId = ({
	ctx,
	migrationRunId,
	triggerRunId,
}) =>
	migrationRunRepo.update({
		ctx,
		internalId: migrationRunId,
		updates: { trigger_run_id: triggerRunId },
	});

const cancelDispatch = async ({
	ctx,
	triggerRunId,
}: {
	ctx: AutumnContext;
	triggerRunId: string;
}) => {
	try {
		await runs.cancel(triggerRunId);
	} catch (error) {
		ctx.logger.warn("run-migration: could not cancel orphaned trigger run", {
			data: {
				triggerRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

const settleOrphanedRun = async ({
	ctx,
	migrationRunId,
	message,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	message: string;
}) => {
	try {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRunId,
			updates: {
				status: MigrationRunStatus.Failed,
				error_message: message,
				finished_at: Date.now(),
			},
		});
	} catch (error) {
		ctx.logger.error("run-migration: could not settle the orphaned run", {
			data: {
				migrationRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

/** A run whose handle is not stored can never be checked against trigger.dev,
 * so a lost write cancels the dispatch and fails the claim. */
export const persistDispatchHandle = async ({
	ctx,
	migrationRunId,
	triggerRunId,
	persist = defaultPersistTriggerRunId,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	triggerRunId: string;
	persist?: PersistTriggerRunId;
}): Promise<void> => {
	try {
		await persist({ ctx, migrationRunId, triggerRunId });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.logger.error("run-migration: failed to persist trigger run id", {
			data: { migrationRunId, triggerRunId, error: message },
		});
		await cancelDispatch({ ctx, triggerRunId });
		await settleOrphanedRun({ ctx, migrationRunId, message });
		throw error;
	}
};
