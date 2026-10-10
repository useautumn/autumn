import { eq, sql } from "drizzle-orm";
import { fileBaselines } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	createDurationModel,
	type EtaPriors,
	type FileBaselineStats,
} from "./estimateRunEta.ts";

const RECENT_RUNS = 10;

/** Every swarm file baseline (folder and global medians need them all), plus recent boot and teardown p50. */
export const loadEtaPriors = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<EtaPriors> => {
	const baselineRows = await ctx.db
		.select({
			file: fileBaselines.file,
			p50Ms: fileBaselines.p50Ms,
			p90Ms: fileBaselines.p90Ms,
			passRate: fileBaselines.passRate,
		})
		.from(fileBaselines)
		.where(eq(fileBaselines.source, "swarm"));
	const [timing] = await ctx.db.execute<{
		boot_p50_ms: number | null;
		teardown_p50_ms: number | null;
	}>(sql`
		with recent as (
			select id, finished_at, progress from runs
			where status in ('passed', 'failed') and finished_at is not null
			order by finished_at desc
			limit ${RECENT_RUNS}
		),
		teardowns as (
			select extract(epoch from r.finished_at - max((f->>'finishedAt')::timestamptz)) * 1000 as ms
			from recent r, jsonb_array_elements(r.progress->'files') f
			where f->>'finishedAt' is not null
			group by r.id, r.finished_at
		),
		boots as (
			select (w->'boot'->>'totalMs')::float8 as ms
			from recent r, jsonb_array_elements(r.progress->'workers') w
			where w->'boot'->>'totalMs' is not null
		)
		select
			(select percentile_cont(0.5) within group (order by ms) from boots) as boot_p50_ms,
			(select percentile_cont(0.5) within group (order by ms) from teardowns) as teardown_p50_ms
	`);
	return {
		model: createDurationModel({
			baselines: new Map<string, FileBaselineStats>(
				baselineRows.map(({ file, ...stats }) => [file, stats]),
			),
		}),
		bootP50Ms: timing?.boot_p50_ms == null ? null : Number(timing.boot_p50_ms),
		teardownP50Ms:
			timing?.teardown_p50_ms === null || timing?.teardown_p50_ms === undefined
				? null
				: Math.max(0, Number(timing.teardown_p50_ms)),
	};
};
