import { eq, sql } from "drizzle-orm";
import type { Drift } from "../../../api/contract.ts";
import { runs } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

const NEW_FAILURE_MIN_PASS_RATE = 0.9;
const SLOW_FACTOR = 1.5;
const SLOW_MIN_MS = 30_000;

/** Flags files that newly fail (baseline pass rate ≥ 0.9) or run > 1.5× baseline p90 (and > 30s); none for repeat runs. */
export const computeRunDrift = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<Drift[]> => {
	const [run] = await ctx.db
		.select({ id: runs.id, repeat: runs.repeat })
		.from(runs)
		.where(eq(runs.id, runId));
	if (!run) {
		throw new TwdError({
			status: 404,
			code: "run_not_found",
			message: `Run ${runId} does not exist.`,
			next: "Check the run id (GET /runs lists recent runs).",
		});
	}
	if (run.repeat > 1) return [];

	const rows = await ctx.db.execute<{
		file: string;
		status: string;
		duration_ms: number;
		p90_ms: number;
		pass_rate: number;
	}>(sql`
		with final as (
			select distinct on (file) file, status, duration_ms
			from test_results
			where run_id = ${runId}
			order by file, attempt desc, created_at desc
		)
		select f.file, f.status, f.duration_ms, b.p90_ms, b.pass_rate
		from final f
		join file_baselines b on b.file = f.file
	`);

	const drift: Drift[] = [];
	for (const row of rows) {
		const failed = row.status === "failed" || row.status === "crashed";
		if (failed && row.pass_rate >= NEW_FAILURE_MIN_PASS_RATE) {
			drift.push({
				file: row.file,
				kind: "new_failure",
				branchValue: 0,
				baselineValue: row.pass_rate,
			});
		}
		if (
			row.duration_ms > SLOW_MIN_MS &&
			row.duration_ms > SLOW_FACTOR * row.p90_ms
		) {
			drift.push({
				file: row.file,
				kind: "slow",
				branchValue: row.duration_ms,
				baselineValue: row.p90_ms,
			});
		}
	}
	return drift;
};
