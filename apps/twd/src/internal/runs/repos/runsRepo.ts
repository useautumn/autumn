import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { RunSummary } from "../../../api/contract.ts";
import { users } from "../../../db/schema/auth.ts";
import { type RunStatus, runs } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export type RunRow = typeof runs.$inferSelect;

export const LIVE_RUN_STATUSES: RunStatus[] = [
	"queued",
	"warming",
	"provisioning",
	"running",
	"tearing_down",
];
export const isTerminalRunStatus = ({ status }: { status: RunStatus }) =>
	!LIVE_RUN_STATUSES.includes(status);

const selectRuns = ({ ctx }: { ctx: TwdContext }) =>
	ctx.db
		.select({ run: runs, email: users.email })
		.from(runs)
		.leftJoin(users, eq(users.id, runs.createdBy));

export const toRunSummary = ({
	run,
	email,
}: {
	run: RunRow;
	email: string | null;
}): RunSummary => ({
	id: run.id,
	branch: run.branch,
	sha: run.sha,
	status: run.status,
	purpose: run.purpose,
	selection: run.selection,
	fileCount: run.fileCount,
	workerCount: run.workerCount,
	passed: run.passed,
	failed: run.failed,
	createdBy: {
		userId: run.createdBy,
		email:
			email ??
			(run.createdBy === SYSTEM_ACTOR.userId ? SYSTEM_ACTOR.email : ""),
		via: run.via,
	},
	createdAt: run.createdAt.toISOString(),
	startedAt: run.startedAt?.toISOString() ?? null,
	finishedAt: run.finishedAt?.toISOString() ?? null,
});

export const getRunWithEmail = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	const found = (await selectRuns({ ctx }).where(eq(runs.id, runId)))[0];
	if (!found) {
		throw new TwdError({
			status: 404,
			code: "run_not_found",
			message: `No run with id "${runId}".`,
			next: "GET /runs?status=all lists runs and their ids.",
		});
	}
	return found;
};

export const listRunsWithEmail = async ({
	ctx,
	status,
	branch,
	limit,
}: {
	ctx: TwdContext;
	status: "live" | "finished" | "all";
	branch?: string;
	limit: number;
}) =>
	selectRuns({ ctx })
		.where(
			and(
				status === "live"
					? inArray(runs.status, LIVE_RUN_STATUSES)
					: status === "finished"
						? notInArray(runs.status, LIVE_RUN_STATUSES)
						: undefined,
				branch ? eq(runs.branch, branch) : undefined,
			),
		)
		.orderBy(desc(runs.createdAt))
		.limit(limit);

export const updateRun = async ({
	ctx,
	runId,
	set,
}: {
	ctx: TwdContext;
	runId: string;
	set: Partial<Omit<RunRow, "id">>;
}) => {
	await ctx.db.update(runs).set(set).where(eq(runs.id, runId));
};
