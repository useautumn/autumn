import { eq, sql } from "drizzle-orm";
import { runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const BASELINE_BRANCH = "dev";
const BASELINE_WINDOW_RUNS = 10;

/** Recompute file_baselines from the final attempt of each file in the last 10 finished dev baseline runs. */
export const refreshBaselines = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<{ files: number }> => {
	const upserted = await ctx.db.execute<{ file: string }>(sql`
		with recent as (
			select id from runs
			where purpose = 'baseline'
				and branch = ${BASELINE_BRANCH}
				and repeat = 1
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

/** Only plain dev baseline runs; a repeat run's samples of one file would skew its p90 and pass rate. */
export const feedsBaseline = ({
	purpose,
	branch,
	repeat,
}: {
	purpose: string;
	branch: string;
	repeat: number;
}) => purpose === "baseline" && branch === BASELINE_BRANCH && repeat === 1;

/** Hook for the runs task: call once a run reaches a terminal status. */
export const onRunFinished = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	const [run] = await ctx.db
		.select({ purpose: runs.purpose, branch: runs.branch, repeat: runs.repeat })
		.from(runs)
		.where(eq(runs.id, runId));
	if (!run || !feedsBaseline(run)) return;
	await refreshBaselines({ ctx });
};
