import { desc, eq } from "drizzle-orm";
import type { RunSummary } from "../../../api/contract.ts";
import { runs, warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { createRun } from "../../runs/actions/createRun.ts";
import { BASELINE_BRANCH } from "./refreshBaselines.ts";

const HOUR_MS = 60 * 60 * 1000;
// Once a day flat for cost; dev moving does not trigger an early baseline.
const BASELINE_INTERVAL_MS = 24 * HOUR_MS;

export const baselineIsDue = ({
	lastCreatedAt,
	now,
}: {
	lastCreatedAt: Date | undefined;
	now: number;
}): boolean =>
	!lastCreatedAt || now - lastCreatedAt.getTime() > BASELINE_INTERVAL_MS;

const UTC_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** True on a UTC day listed in `skipDays` (comma-separated, e.g. "sat,sun"; blank skips none). */
export const isBaselineSkipDay = ({
	now,
	skipDays,
}: {
	now: number;
	skipDays: string;
}): boolean => {
	const skipped = skipDays
		.split(",")
		.map((day) => day.trim().toLowerCase().slice(0, 3));
	return skipped.includes(UTC_DAYS[new Date(now).getUTCDay()] ?? "");
};

/** Interval hook: start a full dev baseline run when the last baseline (scheduled or a full dev-HEAD run) is more than 24h old, except on skip days. */
export const scheduleBaselineRuns = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<RunSummary | null> => {
	const [lastRun] = await ctx.db
		.select({ sha: runs.sha, createdAt: runs.createdAt })
		.from(runs)
		.where(eq(runs.isBaseline, true))
		.orderBy(desc(runs.createdAt))
		.limit(1);

	const now = Date.now();
	const skipDays = process.env.TWD_BASELINE_SKIP_DAYS ?? "sat,sun";
	if (isBaselineSkipDay({ now, skipDays })) return null;
	if (!baselineIsDue({ lastCreatedAt: lastRun?.createdAt, now })) return null;

	// Every push to dev is auto-warmed, so the newest warm image tracks dev's head.
	const [devHead] = await ctx.db
		.select({ sha: warmImages.sha })
		.from(warmImages)
		.where(eq(warmImages.branch, BASELINE_BRANCH))
		.orderBy(desc(warmImages.createdAt))
		.limit(1);

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
