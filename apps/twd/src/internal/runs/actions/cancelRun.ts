import { and, eq, inArray } from "drizzle-orm";
import type { RunSummary } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getLiveRun } from "../live/liveRuns.ts";
import {
	getRunWithEmail,
	isTerminalRunStatus,
	toRunSummary,
	updateRun,
} from "../repos/runsRepo.ts";

/** Idempotent. A live swarm SIGTERMs its child (which tears down); a queued run just flips. */
export const cancelRun = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<RunSummary> => {
	const { run } = await getRunWithEmail({ ctx, runId });
	if (isTerminalRunStatus({ status: run.status })) {
		return getRunWithEmail({ ctx, runId }).then(toRunSummary);
	}
	if (run.jobId) {
		await ctx.db
			.update(jobs)
			.set({ cancelRequestedAt: new Date() })
			.where(
				and(
					eq(jobs.id, run.jobId),
					inArray(jobs.status, ["queued", "running"]),
				),
			);
	}
	const live = getLiveRun({ runId });
	if (live?.cancel) {
		live.cancel();
	} else {
		await updateRun({
			ctx,
			runId,
			set: { status: "cancelled", finishedAt: new Date() },
		});
	}
	ctx.logger.info("run cancel requested", { runId, by: ctx.actor?.email });
	return getRunWithEmail({ ctx, runId }).then(toRunSummary);
};
