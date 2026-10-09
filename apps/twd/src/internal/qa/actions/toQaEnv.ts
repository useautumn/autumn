import type { QaEnv } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { QaEnvRow } from "../repos/qaEnvsRepo.ts";
import { qaWorker, type WorkerEnvStatus } from "../worker/qaWorkerClient.ts";

/** Row state, with live awake/build progress from the Worker when it answers. */
export const toQaEnv = async ({
	ctx,
	row,
}: {
	ctx: TwdContext;
	row: QaEnvRow;
}): Promise<QaEnv> => {
	const expired =
		row.state !== "deleted" && row.expiresAt.getTime() < Date.now();
	const live: WorkerEnvStatus | null =
		row.state === "deleted" || expired
			? null
			: await qaWorker.status({ ctx, name: row.name }).catch(() => null);
	const progress = live?.pendingBuild?.progress;
	return {
		name: row.name,
		url: row.url,
		ref: row.ref,
		sha: row.sha,
		state: expired ? "deleted" : row.state,
		awake: live ? live.awake : null,
		building: progress
			? {
					phase: progress.phase,
					elapsedMs: progress.elapsedMs,
					remainingMs: progress.remainingMs,
					percent: progress.percent,
				}
			: null,
		error: row.error,
		createdBy: row.createdBy,
		createdAt: row.createdAt.toISOString(),
		expiresAt: row.expiresAt.toISOString(),
		lastActiveAt: live?.lastActiveAt
			? new Date(live.lastActiveAt).toISOString()
			: null,
		jobId: row.lastJobId,
	};
};
