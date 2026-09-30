import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { users } from "../../../db/schema/auth.ts";
import { runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

const TOP_RUNS = 10;

export type CostRow = {
	bucket_ms: number;
	user_id: string;
	email: string | null;
	usd: number;
	warm_usd: number;
	runs: number;
	worker_seconds: number;
};

/** Run + warm-build cost per (UTC bucket, user) in [from, to). Warm builds without an owner count as "system". */
export const selectCostRows = async ({
	ctx,
	from,
	to,
	bucket,
}: {
	ctx: TwdContext;
	from: Date;
	to: Date;
	bucket: "day" | "week";
}) => {
	const [fromIso, toIso] = [from.toISOString(), to.toISOString()];
	return ctx.db.execute<CostRow>(sql`
		with spend as (
			select created_at, created_by as user_id, cost_usd::float8 as usd, 0::float8 as warm_usd,
				1 as runs, worker_seconds::float8 as worker_seconds
			from runs
			where created_at >= ${fromIso}::timestamptz and created_at < ${toIso}::timestamptz
			union all
			select created_at, coalesce(created_by, 'system'), cost_usd::float8, cost_usd::float8, 0, 0
			from warm_images
			where cost_usd is not null and created_at >= ${fromIso}::timestamptz and created_at < ${toIso}::timestamptz
		)
		select
			(extract(epoch from date_trunc(${bucket}, s.created_at, 'UTC')) * 1000)::float8 as bucket_ms,
			s.user_id,
			u.email,
			sum(s.usd)::float8 as usd,
			sum(s.warm_usd)::float8 as warm_usd,
			sum(s.runs)::int as runs,
			sum(s.worker_seconds)::float8 as worker_seconds
		from spend s
		left join users u on u.id = s.user_id
		group by 1, 2, 3
		order by 1
	`);
};

export const selectTopCostRuns = async ({
	ctx,
	from,
	to,
}: {
	ctx: TwdContext;
	from: Date;
	to: Date;
}) =>
	ctx.db
		.select({ run: runs, email: users.email })
		.from(runs)
		.leftJoin(users, eq(users.id, runs.createdBy))
		.where(and(gte(runs.createdAt, from), lt(runs.createdAt, to)))
		.orderBy(desc(runs.costUsd))
		.limit(TOP_RUNS);
