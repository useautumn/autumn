import { eq } from "drizzle-orm";
import type { EnqueueResponse, Job } from "../../../api/contract.ts";
import { users } from "../../../db/schema/auth.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { enqueueJob } from "../../jobs/actions/enqueueJob.ts";
import type { JobRow } from "../../jobs/types/jobRow.ts";
import { resolveBranchSha } from "./gitRemote.ts";

const toJob = async ({
	ctx,
	job,
}: {
	ctx: TwdContext;
	job: JobRow;
}): Promise<Job> => {
	const email =
		ctx.actor?.userId === job.createdBy
			? ctx.actor.email
			: ((
					await ctx.db
						.select({ email: users.email })
						.from(users)
						.where(eq(users.id, job.createdBy))
				)[0]?.email ?? "");
	return {
		id: job.id,
		kind: job.kind,
		singletonKey: job.singletonKey,
		status: job.status,
		error: job.error,
		attempts: job.attempts,
		createdBy: { userId: job.createdBy, email, via: job.via },
		createdAt: job.createdAt.toISOString(),
		startedAt: job.startedAt?.toISOString() ?? null,
		finishedAt: job.finishedAt?.toISOString() ?? null,
	};
};

/** Warm any pushed branch head (no PR needed). Attaches to a live warm:<sha> job. */
export const warmBranch = async ({
	ctx,
	branch,
}: {
	ctx: TwdContext;
	branch: string;
}): Promise<EnqueueResponse> => {
	const sha = await resolveBranchSha({ branch });
	const { job, deduped } = await enqueueJob({
		ctx,
		kind: "warm",
		singletonKey: `warm:${sha}`,
		payload: { sha, branch },
	});
	return { job: await toJob({ ctx, job }), deduped };
};
