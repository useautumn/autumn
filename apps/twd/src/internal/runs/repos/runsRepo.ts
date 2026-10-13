import {
	type AnyColumn,
	and,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lt,
	lte,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	BRANCH_HISTORY_RUNS,
	type RunLive,
	type RunSummary,
} from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { users } from "../../../db/schema/auth.ts";
import { type RunStatus, runs } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import { SYSTEM_ACTOR } from "../../../lib/createContext.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getRunDemand } from "../../accounts/allocator/runDemands.ts";
import { getLiveRun } from "../live/liveRuns.ts";

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

/** 1-based FIFO place among queued runs holding no account; null otherwise. */
export const queuePositionSql = sql<
	number | null
>`case when ${runs.status} = 'queued' and ${holdsNoAccounts(runs.id)} then (select count(*) from runs earlier where earlier.status = 'queued' and earlier.created_at <= ${runs.createdAt} and not exists (select 1 from stripe_accounts held where held.run_id = earlier.id and held.state = 'in_use')) end`.mapWith(
	Number,
);

/** Most workers attached at once, from run_workers lifetimes; an end sorts before a start at the same instant. */
export const peakWorkersSql =
	sql<number>`(select coalesce(max(attached), 0) from (select sum(delta) over (order by at, delta) as attached from (select w.started_at as at, 1 as delta from run_workers w where w.run_id = ${runs.id} union all select coalesce(w.ended_at, ${runs.finishedAt}), -1 from run_workers w where w.run_id = ${runs.id} and coalesce(w.ended_at, ${runs.finishedAt}) is not null) lifetimes) running)`.mapWith(
		Number,
	);

const selectRuns = ({ ctx }: { ctx: TwdContext }) =>
	ctx.db
		.select({
			run: runs,
			email: users.email,
			queuePosition: queuePositionSql,
			peakWorkers: peakWorkersSql,
			/** Full µs precision; a JS Date would truncate it and skip rows in keyset paging. */
			createdAtRaw: sql<string>`${runs.createdAt}::text`,
		})
		.from(runs)
		.leftJoin(users, eq(users.id, runs.createdBy));

const toRunLive = ({ run }: { run: RunRow }): RunLive | null => {
	const live = getLiveRun({ runId: run.id });
	if (!live || isTerminalRunStatus({ status: run.status })) return null;
	const workers: RunLive["workers"] = {};
	for (const { status } of live.workers.values())
		workers[status] = (workers[status] ?? 0) + 1;
	return {
		workers,
		etaMs: live.eta?.etaMs ?? null,
		accountsPending: getRunDemand({ runId: run.id }) ?? 0,
	};
};

export const toRunSummary = ({
	run,
	email,
	queuePosition = null,
	peakWorkers,
}: {
	run: RunRow;
	email: string | null;
	queuePosition?: number | null;
	peakWorkers?: number;
}): RunSummary => ({
	id: run.id,
	branch: run.branch,
	sha: run.sha,
	status: run.status,
	purpose: run.purpose,
	baseline: run.isBaseline,
	selection: run.selection,
	repeat: run.repeat,
	fileCount: run.fileCount,
	workerCount:
		isTerminalRunStatus({ status: run.status }) && peakWorkers !== undefined
			? peakWorkers
			: run.workerCount,
	workersWanted: run.workersWanted,
	queuePosition,
	cost: {
		usd: run.costUsd,
		workerSeconds: run.workerSeconds,
		final: isTerminalRunStatus({ status: run.status }),
	},
	passed: run.passed,
	failed: run.failed,
	newFailures: run.newFailures,
	live: toRunLive({ run }),
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

export type RunsFilter = {
	status: "live" | "finished" | "all";
	outcome?: "all" | "passed" | "failed" | "cancelled";
	purpose?: "adhoc" | "baseline";
	baseline?: boolean;
	branch?: string;
	exactBranch?: string;
};
export type RunsCursor = { createdAt: string; id: string };

const OUTCOME_STATUSES: Record<"passed" | "failed" | "cancelled", RunStatus[]> =
	{
		passed: ["passed"],
		failed: ["failed", "errored"],
		cancelled: ["cancelled"],
	};

const runsFilterSql = ({
	status,
	outcome = "all",
	purpose,
	baseline,
	branch,
	exactBranch,
}: RunsFilter) =>
	and(
		status === "live"
			? inArray(runs.status, LIVE_RUN_STATUSES)
			: status === "finished"
				? notInArray(runs.status, LIVE_RUN_STATUSES)
				: undefined,
		outcome === "all"
			? undefined
			: inArray(runs.status, OUTCOME_STATUSES[outcome]),
		purpose ? eq(runs.purpose, purpose) : undefined,
		baseline === undefined ? undefined : eq(runs.isBaseline, baseline),
		branch
			? ilike(runs.branch, `%${branch.replace(/[\\%_]/g, "\\$&")}%`)
			: undefined,
		exactBranch ? eq(runs.branch, exactBranch) : undefined,
	);

/** Keyset page ordered newest first; ties on created_at break by id. */
export const listRunsWithEmail = async ({
	ctx,
	filter,
	cursor,
	limit,
}: {
	ctx: TwdContext;
	filter: RunsFilter;
	cursor?: RunsCursor;
	limit: number;
}) => {
	const after: SQL | undefined = cursor
		? or(
				lt(runs.createdAt, sql`${cursor.createdAt}::timestamptz`),
				and(
					eq(runs.createdAt, sql`${cursor.createdAt}::timestamptz`),
					lt(runs.id, cursor.id),
				),
			)
		: undefined;
	return selectRuns({ ctx })
		.where(and(runsFilterSql(filter), after))
		.orderBy(desc(runs.createdAt), desc(runs.id))
		.limit(limit);
};

export const countRuns = async ({
	ctx,
	filter,
}: {
	ctx: TwdContext;
	filter: RunsFilter;
}) =>
	(
		await ctx.db
			.select({ n: sql<number>`count(*)::int` })
			.from(runs)
			.where(runsFilterSql(filter))
	)[0]?.n ?? 0;

/** Only a passed or failed run can be a baseline; onRunFinished checks those ran every file. */
const NEVER_BASELINE: RunStatus[] = ["cancelled", "errored"];

/** Every run write goes through here, so a cancel or error on any path also drops the baseline flag. */
export const updateRun = async ({
	ctx,
	runId,
	set,
}: {
	ctx: TwdContext;
	runId: string;
	set: Partial<Omit<RunRow, "id">>;
}) => {
	const settled =
		set.status && NEVER_BASELINE.includes(set.status)
			? { ...set, isBaseline: false }
			: set;
	await ctx.db.update(runs).set(settled).where(eq(runs.id, runId));
};

export type BranchesCursor = { lastAt: string; branch: string };

/** One page of branches by latest finished run, each with its last BRANCH_HISTORY_RUNS finished runs. */
export const listBranchHistories = async ({
	ctx,
	branch,
	cursor,
	limit,
}: {
	ctx: TwdContext;
	branch?: string;
	cursor?: BranchesCursor;
	limit: number;
}) => {
	const finished = runsFilterSql({ status: "finished", branch });
	const lastAt = sql<string>`max(${runs.createdAt})`;
	const page = await ctx.db
		.select({ branch: runs.branch, lastAt: sql<string>`${lastAt}::text` })
		.from(runs)
		.where(finished)
		.groupBy(runs.branch)
		.having(
			cursor
				? sql`(${lastAt}, ${runs.branch}) < (${cursor.lastAt}::timestamptz, ${cursor.branch})`
				: undefined,
		)
		.orderBy(desc(lastAt), desc(runs.branch))
		.limit(limit);
	if (page.length === 0) return { page, runsByBranch: new Map() };

	const ranked = ctx.db
		.select({
			id: runs.id,
			rank: sql<number>`row_number() over (partition by ${runs.branch} order by ${runs.createdAt} desc, ${runs.id} desc)`.as(
				"rank",
			),
		})
		.from(runs)
		.where(
			and(
				finished,
				inArray(
					runs.branch,
					page.map((p) => p.branch),
				),
			),
		)
		.as("ranked");
	const rows = await selectRuns({ ctx })
		.where(
			inArray(
				runs.id,
				ctx.db
					.select({ id: ranked.id })
					.from(ranked)
					.where(lte(ranked.rank, BRANCH_HISTORY_RUNS)),
			),
		)
		.orderBy(desc(runs.createdAt), desc(runs.id));
	const runsByBranch = new Map<string, RunSummary[]>();
	for (const row of rows)
		runsByBranch.set(row.run.branch, [
			...(runsByBranch.get(row.run.branch) ?? []),
			toRunSummary(row),
		]);
	return { page, runsByBranch };
};

export const getRunStatsSince = async ({
	ctx,
	since,
}: {
	ctx: TwdContext;
	since: Date;
}) => {
	const [row] = await ctx.db
		.select({
			runs: sql<number>`count(*)::int`,
			usd: sql<number>`coalesce(sum(${runs.costUsd}), 0)::float8`,
		})
		.from(runs)
		.where(gte(runs.createdAt, since));
	return { runs: row?.runs ?? 0, usd: row?.usd ?? 0 };
};
