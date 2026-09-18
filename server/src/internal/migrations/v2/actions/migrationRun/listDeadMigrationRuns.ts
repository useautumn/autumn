import { type MigrationRun, ms, withTimeout } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isTriggerRunTerminal } from "./triggerRunLiveness.js";

const LIVENESS_TIMEOUT = ms.seconds(2);

export type TriggerLivenessCheck = (params: {
	ctx: AutumnContext;
	triggerRunId: string;
}) => Promise<boolean>;

const isDead = async ({
	ctx,
	run,
	isTerminal,
}: {
	ctx: AutumnContext;
	run: MigrationRun;
	isTerminal: TriggerLivenessCheck;
}): Promise<boolean> => {
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
};

export const listDeadMigrationRuns = async ({
	ctx,
	runs,
	isTerminal = isTriggerRunTerminal,
}: {
	ctx: AutumnContext;
	runs: MigrationRun[];
	isTerminal?: TriggerLivenessCheck;
}): Promise<MigrationRun[]> => {
	const liveness = await Promise.all(
		runs.map((run) => isDead({ ctx, run, isTerminal })),
	);
	return runs.filter((_, index) => liveness[index]);
};
