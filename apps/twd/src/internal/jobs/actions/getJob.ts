import { eq } from "drizzle-orm";
import type { Job } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { selectApiJobs } from "../repos/selectApiJobs.ts";

export const getJob = async ({
	ctx,
	jobId,
}: {
	ctx: TwdContext;
	jobId: string;
}): Promise<Job> => {
	const [job] = await selectApiJobs({
		db: ctx.db,
		where: eq(jobs.id, jobId),
		limit: 1,
	});
	if (job) return job;
	throw new TwdError({
		status: 404,
		code: "job_not_found",
		message: `Job '${jobId}' does not exist.`,
		next: "List jobs with GET /jobs and use an id from the response.",
	});
};
