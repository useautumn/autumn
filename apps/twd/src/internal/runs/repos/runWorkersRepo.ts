import { and, eq, isNull } from "drizzle-orm";
import { runWorkers } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCostRates } from "../../costs/actions/getCostRates.ts";

/** One row per worker sandbox, priced at the configured worker size. */
export const insertRunWorker = async ({
	ctx,
	runId,
	name,
	sandboxId,
	accountId,
}: {
	ctx: TwdContext;
	runId: string;
	name: string;
	sandboxId: string | null;
	accountId: string;
}) => {
	const { workerCores, workerMemoryGib } = getCostRates();
	await ctx.db.insert(runWorkers).values({
		id: `rw_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
		runId,
		name,
		sandboxId,
		accountId,
		cores: workerCores,
		memoryGib: workerMemoryGib,
	});
};

/** Stamp ended_at on the run's open rows (one worker by name, or all of them). */
export const endRunWorkers = async ({
	ctx,
	runId,
	name,
}: {
	ctx: TwdContext;
	runId: string;
	name?: string;
}) => {
	await ctx.db
		.update(runWorkers)
		.set({ endedAt: new Date() })
		.where(
			and(
				eq(runWorkers.runId, runId),
				isNull(runWorkers.endedAt),
				name ? eq(runWorkers.name, name) : undefined,
			),
		);
};
