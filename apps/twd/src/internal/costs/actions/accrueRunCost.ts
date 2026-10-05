import { sql } from "drizzle-orm";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCostRates } from "./getCostRates.ts";

/**
 * Recompute runs.cost_usd / worker_seconds from run_workers: each sandbox's create → terminate, open rows priced up to now.
 * Idempotent; call periodically while live and once after teardown.
 */
export const accrueRunCost = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	const { usdPerCoreSecond, usdPerGibSecond, regionMultiplier } =
		getCostRates();
	await ctx.db.execute(sql`
		update runs set
			worker_seconds = totals.seconds,
			cost_usd = totals.usd
		from (
			select
				coalesce(sum(w.seconds), 0) as seconds,
				coalesce(sum(w.seconds * (w.cores * ${usdPerCoreSecond}::float8 + w.memory_gib * ${usdPerGibSecond}::float8)), 0) * ${regionMultiplier}::float8 as usd
			from (
				select cores, memory_gib,
					greatest(extract(epoch from coalesce(ended_at, now()) - started_at), 0)::float8 as seconds
				from run_workers
				where run_id = ${runId}
			) w
		) totals
		where runs.id = ${runId}
	`);
};
