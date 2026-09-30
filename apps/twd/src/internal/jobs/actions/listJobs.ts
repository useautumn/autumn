import { and, eq, inArray } from "drizzle-orm";
import type { Job } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { selectApiJobs } from "../repos/selectApiJobs.ts";
import type { ListJobsQuery } from "../types/listJobsQuery.ts";

export const listJobs = ({
	ctx,
	query,
}: {
	ctx: TwdContext;
	query: ListJobsQuery;
}): Promise<Job[]> => {
	const statusFilter =
		query.status === "live"
			? inArray(jobs.status, ["queued", "running"])
			: query.status === "finished"
				? inArray(jobs.status, ["succeeded", "failed", "cancelled"])
				: undefined;
	return selectApiJobs({
		db: ctx.db,
		where: and(
			statusFilter,
			query.kind ? eq(jobs.kind, query.kind) : undefined,
		),
		limit: query.limit,
	});
};
