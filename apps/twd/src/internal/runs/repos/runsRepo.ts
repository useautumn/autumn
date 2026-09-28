import {
	type AnyColumn,
	and,
	desc,
	eq,
	inArray,
	notInArray,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { RunSummary } from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
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

const holdsNoAccounts = (runId: AnyColumn) =>
	sql`not exists (select 1 from ${stripeAccounts} where ${stripeAccounts.runId} = ${runId} and ${stripeAccounts.state} = 'in_use')`;

const earlierRuns = alias(runs, "earlier_runs");

/** 1-based FIFO place among queued runs holding no account; null otherwise. */
export const queuePositionSql = sql<
	number | null
>`case when ${runs.status} = 'queued' and ${holdsNoAccounts(runs.id)} then (select count(*) from ${earlierRuns} where ${earlierRuns.status} = 'queued' and ${earlierRuns.createdAt} <= ${runs.createdAt} and ${holdsNoAccounts(earlierRuns.id)}) end`.mapWith(
	Number,
);

const selectRuns = ({ ctx }: { ctx: TwdContext }) =>
	ctx.db
		.select({ run: runs, email: users.email, queuePosition: queuePositionSql })
		.from(runs)
		.leftJoin(users, eq(users.id, runs.createdBy));

export const toRunSummary = ({
	run,
	email,
	queuePosition = null,
}: {
	run: RunRow;
	email: string | null;
	queuePosition?: number | null;
}): RunSummary => ({
	id: run.id,
	branch: run.branch,
	sha: run.sha,
	status: run.status,
	purpose: run.purpose,
	selection: run.selection,
	fileCount: run.fileCount,
	workerCount: run.workerCount,
	workersWanted: run.workersWanted,
	queuePosition,
	cost: {
		usd: run.costUsd,
		workerSeconds: run.workerSeconds,
		final: isTerminalRunStatus({ status: run.status }),
	},
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
	pinnedSha: run.pinnedSha,
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
