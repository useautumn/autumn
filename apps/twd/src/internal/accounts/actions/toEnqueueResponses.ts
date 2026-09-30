import { inArray } from "drizzle-orm";
import type { EnqueueResponse } from "../../../api/contract.ts";
import { users } from "../../../db/schema/auth.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobRow } from "../../jobs/types/jobRow.ts";

/** JobRow → contract EnqueueResponse. Integrator: swap for the jobs task's mapper if it exports one. */
export const toEnqueueResponses = async ({
	ctx,
	results,
}: {
	ctx: TwdContext;
	results: { job: JobRow; deduped: boolean }[];
}): Promise<EnqueueResponse[]> => {
	const userIds = [...new Set(results.map(({ job }) => job.createdBy))];
	const emails = new Map(
		userIds.length
			? (
					await ctx.db
						.select({ id: users.id, email: users.email })
						.from(users)
						.where(inArray(users.id, userIds))
				).map((user) => [user.id, user.email])
			: [],
	);
	return results.map(({ job, deduped }) => ({
		deduped,
		job: {
			id: job.id,
			kind: job.kind,
			singletonKey: job.singletonKey,
			status: job.status,
			error: job.error,
			attempts: job.attempts,
			createdBy: {
				userId: job.createdBy,
				email:
					emails.get(job.createdBy) ??
					(ctx.actor?.userId === job.createdBy
						? ctx.actor.email
						: job.createdBy),
				via: job.via,
			},
			createdAt: job.createdAt.toISOString(),
			startedAt: job.startedAt?.toISOString() ?? null,
			finishedAt: job.finishedAt?.toISOString() ?? null,
		},
	}));
};
