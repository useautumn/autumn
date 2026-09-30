import { and, eq, sql } from "drizzle-orm";
import type { Job } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getJob } from "./getJob.ts";

/** Queued jobs cancel immediately; running jobs get cancel_requested_at and the runner aborts them. */
export const cancelJob = async ({
	ctx,
	jobId,
}: {
	ctx: TwdContext;
	jobId: string;
}): Promise<Job> => {
	const cancelledQueued = await ctx.db
		.update(jobs)
		.set({
			status: "cancelled",
			cancelRequestedAt: sql`now()`,
			finishedAt: sql`now()`,
			leaseOwner: null,
			leaseExpiresAt: null,
		})
		.where(and(eq(jobs.id, jobId), eq(jobs.status, "queued")))
		.returning({ id: jobs.id });
	if (cancelledQueued.length === 0) {
		await ctx.db
			.update(jobs)
			.set({
				cancelRequestedAt: sql`coalesce(${jobs.cancelRequestedAt}, now())`,
			})
			.where(and(eq(jobs.id, jobId), eq(jobs.status, "running")));
	}

	const job = await getJob({ ctx, jobId });
	ctx.logger.info("job cancel requested", {
		jobId,
		status: job.status,
		by: ctx.actor?.userId,
		via: ctx.actor?.via,
	});
	if (job.status === "succeeded" || job.status === "failed") {
		throw new TwdError({
			status: 409,
			code: "job_already_finished",
			message: `Job '${jobId}' already ${job.status}; there is nothing to cancel.`,
			next: "No action needed. Enqueue a new job if you want to run it again.",
			details: { job },
		});
	}
	return job;
};
