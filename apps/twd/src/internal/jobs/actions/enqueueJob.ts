import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { JobKind } from "../../../db/schema/jobs.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobRow } from "../types/jobRow.ts";

/**
 * Insert a job, or attach to the live job holding `singletonKey` (`deduped: true`).
 * Uses ctx.actor for created_by/via. OWNED BY THE JOBS TASK — signature is frozen.
 */
export const enqueueJob = async ({
	ctx,
	kind,
	singletonKey,
	payload,
}: {
	ctx: TwdContext;
	kind: JobKind;
	singletonKey: string;
	payload: Record<string, unknown>;
}): Promise<{ job: JobRow; deduped: boolean }> => {
	const actor = ctx.actor ?? SYSTEM_ACTOR;
	// A live row can finish between our conflict and reselect; a retry then inserts cleanly.
	for (let attempt = 0; attempt < 3; attempt++) {
		const result = await ctx.db.transaction(async (tx) => {
			const [inserted] = await tx
				.insert(jobs)
				.values({
					id: `job_${randomUUID()}`,
					kind,
					singletonKey,
					payload,
					createdBy: actor.userId,
					via: actor.via,
				})
				.onConflictDoNothing({
					target: jobs.singletonKey,
					where: sql`status in ('queued', 'running')`,
				})
				.returning();
			if (inserted) return { job: inserted, deduped: false };

			const [live] = await tx
				.select()
				.from(jobs)
				.where(
					and(
						eq(jobs.singletonKey, singletonKey),
						inArray(jobs.status, ["queued", "running"]),
					),
				)
				.limit(1);
			return live ? { job: live, deduped: true } : undefined;
		});
		if (result) return result;
	}
	throw new TwdError({
		status: 409,
		code: "job_enqueue_contention",
		message: `Could not enqueue or attach to job '${singletonKey}' after 3 attempts.`,
		next: "Retry the request in a few seconds.",
		details: { singletonKey, kind },
	});
};
