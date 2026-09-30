import { and, desc, eq } from "drizzle-orm";
import type { RunSummary } from "../../../api/contract.ts";
import { runs, warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { createRun } from "../../runs/actions/createRun.ts";
import { BASELINE_BRANCH } from "./refreshBaselines.ts";

const HOUR_MS = 60 * 60 * 1000;
const MAX_BASELINE_AGE_MS = 24 * HOUR_MS;
const MIN_BASELINE_GAP_MS = 6 * HOUR_MS;

/** Interval hook: start a full dev baseline run when the last one is > 24h old, or dev moved and ≥ 6h passed. */
export const scheduleBaselineRuns = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<RunSummary | null> => {
	const [lastRun] = await ctx.db
		.select({ sha: runs.sha, createdAt: runs.createdAt })
		.from(runs)
		.where(and(eq(runs.branch, BASELINE_BRANCH), eq(runs.purpose, "baseline")))
		.orderBy(desc(runs.createdAt))
		.limit(1);

	// Every push to dev is auto-warmed, so the newest warm image tracks dev's head.
	const [devHead] = await ctx.db
		.select({ sha: warmImages.sha })
		.from(warmImages)
		.where(eq(warmImages.branch, BASELINE_BRANCH))
		.orderBy(desc(warmImages.createdAt))
		.limit(1);

	const ageMs = lastRun
		? Date.now() - lastRun.createdAt.getTime()
		: Number.POSITIVE_INFINITY;
	const devMoved = devHead !== undefined && devHead.sha !== lastRun?.sha;
	const due =
		ageMs > MAX_BASELINE_AGE_MS || (devMoved && ageMs >= MIN_BASELINE_GAP_MS);
	if (!due) return null;

	ctx.logger.info("scheduling dev baseline run", {
		lastSha: lastRun?.sha ?? null,
		headSha: devHead?.sha ?? null,
	});
	return createRun({
		ctx,
		branch: BASELINE_BRANCH,
		selection: { groups: ["all"] },
		purpose: "baseline",
	});
};
