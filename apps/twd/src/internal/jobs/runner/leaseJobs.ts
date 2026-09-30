import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { JobKind } from "../../../db/schema/jobs.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import type { JobRow } from "../types/jobRow.ts";

/** Claims the oldest runnable job of `kind`: queued (past any retry backoff) or running with an expired lease. */
export const leaseNextJob = async ({
	db,
	kind,
	owner,
	leaseMs,
}: {
	db: TwdDb;
	kind: JobKind;
	owner: string;
	leaseMs: number;
}): Promise<JobRow | undefined> => {
	const [job] = await db
		.update(jobs)
		.set({
			status: "running",
			leaseOwner: owner,
			leaseExpiresAt: sql`now() + make_interval(secs => ${leaseMs / 1000})`,
			fencingToken: sql`${jobs.fencingToken} + 1`,
			attempts: sql`${jobs.attempts} + 1`,
			startedAt: sql`coalesce(${jobs.startedAt}, now())`,
		})
		.where(
			eq(
				jobs.id,
				sql`(
					select id from jobs
					where kind = ${kind}
						and (
							(status = 'queued' and (lease_expires_at is null or lease_expires_at < now()))
							or (status = 'running' and lease_expires_at < now())
						)
					order by created_at
					for update skip locked
					limit 1
				)`,
			),
		)
		.returning();
	return job;
};

/** Running jobs whose holder crashed on every attempt would otherwise be re-leased forever. */
export const failExhaustedJobs = async ({
	db,
	maxAttempts,
}: {
	db: TwdDb;
	maxAttempts: number;
}) =>
	db
		.update(jobs)
		.set({
			status: "failed",
			error: sql`coalesce(${jobs.error} || E'\n', '') || 'lease expired after ' || ${jobs.attempts} || ' attempts (worker crashed or was killed)'`,
			finishedAt: sql`now()`,
			leaseOwner: null,
			leaseExpiresAt: null,
		})
		.where(
			and(
				eq(jobs.status, "running"),
				lt(jobs.leaseExpiresAt, sql`now()`),
				gte(jobs.attempts, maxAttempts),
			),
		)
		.returning({ id: jobs.id, kind: jobs.kind });
