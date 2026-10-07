import { eq, sql } from "drizzle-orm";
import { runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const BASELINE_BRANCH = "dev";
const BASELINE_WINDOW_RUNS = 10;

/** Recompute file_baselines from the final attempt of each file in the last 10 finished baseline runs. */
export const refreshBaselines = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<{ files: number }> => {
	const upserted = await ctx.db.execute<{ file: string }>(sql`
		with recent as (
			select id from runs
			where is_baseline
				and status in ('passed', 'failed')
				and finished_at is not null
			order by finished_at desc
			limit ${BASELINE_WINDOW_RUNS}
		),
		final as (
			select distinct on (run_id, file) run_id, file, status, duration_ms
			from test_results
			where run_id in (select id from recent)
			order by run_id, file, attempt desc, created_at desc
		)
		insert into file_baselines (file, p50_ms, p90_ms, pass_rate, samples, updated_at)
		select
			file,
			round(percentile_cont(0.5) within group (order by duration_ms))::int,
			round(percentile_cont(0.9) within group (order by duration_ms))::int,
			avg(case when status = 'passed' then 1.0 else 0.0 end)::real,
			count(*)::int,
			now()
		from final
		where status <> 'skipped'
		group by file
		on conflict (file) do update set
			p50_ms = excluded.p50_ms,
			p90_ms = excluded.p90_ms,
			pass_rate = excluded.pass_rate,
			samples = excluded.samples,
			updated_at = excluded.updated_at
		returning file
	`);
	ctx.logger.info("baselines refreshed", { files: upserted.length });
	return { files: upserted.length };
};

/** Files failing in a finished run that were not failing in the baseline that finished before it; null without one. */
export const recordNewFailures = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	await ctx.db.execute(sql`
		update runs r set new_failures = case when r.failed = 0 then 0 else (
			select case when prev.id is null then null else (
				select count(*)::int from (
					select distinct on (t.file) t.file, t.status from test_results t
					where t.run_id = r.id order by t.file, t.attempt desc, t.created_at desc
				) cur
				where cur.status in ('failed', 'crashed', 'timed_out')
				and coalesce((
					select p.status from test_results p
					where p.run_id = prev.id and p.file = cur.file
					order by p.attempt desc, p.created_at desc limit 1
				), 'passed') not in ('failed', 'crashed', 'timed_out')
			) end
			from (
				select (
					select b.id from runs b
					where b.is_baseline and b.status in ('passed', 'failed') and b.id <> r.id
						and b.finished_at < r.finished_at
					order by b.finished_at desc limit 1
				) as id
			) prev
		) end
		where r.id = ${runId} and r.repeat = 1 and r.status in ('passed', 'failed')
			and r.finished_at is not null
	`);
};

/** Hook for the runs task: call once a run reaches a terminal status. */
export const onRunFinished = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	await recordNewFailures({ ctx, runId });
	const [run] = await ctx.db
		.select({ isBaseline: runs.isBaseline })
		.from(runs)
		.where(eq(runs.id, runId));
	if (run?.isBaseline) await refreshBaselines({ ctx });
};
