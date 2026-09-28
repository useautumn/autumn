import { desc, eq, type SQL } from "drizzle-orm";
import type { Job } from "../../../api/contract.ts";
import { users } from "../../../db/schema/auth.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import type { JobRow } from "../types/jobRow.ts";

const iso = (date: Date | null) => date?.toISOString() ?? null;

export const toApiJob = ({
	job,
	email,
}: {
	job: JobRow;
	email: string | null;
}): Job => ({
	id: job.id,
	kind: job.kind,
	singletonKey: job.singletonKey,
	status: job.status,
	error: job.error,
	attempts: job.attempts,
	createdBy: {
		userId: job.createdBy,
		email: email ?? job.createdBy,
		via: job.via,
	},
	createdAt: job.createdAt.toISOString(),
	startedAt: iso(job.startedAt),
	finishedAt: iso(job.finishedAt),
});

/** Jobs joined with their creator's email, newest first, in the contract `Job` shape. */
export const selectApiJobs = async ({
	db,
	where,
	limit,
}: {
	db: TwdDb;
	where?: SQL;
	limit: number;
}): Promise<Job[]> => {
	const rows = await db
		.select({ job: jobs, email: users.email })
		.from(jobs)
		.leftJoin(users, eq(users.id, jobs.createdBy))
		.where(where)
		.orderBy(desc(jobs.createdAt))
		.limit(limit);
	return rows.map(toApiJob);
};
