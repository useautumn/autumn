import type { BranchesPage, RunSummary } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	type BranchesCursor,
	countRuns,
	listBranchHistories,
	listRunsWithEmail,
	type RunsCursor,
	type RunsFilter,
	toRunSummary,
} from "../repos/runsRepo.ts";

export const listRuns = async ({
	ctx,
	limit,
	...filter
}: RunsFilter & { ctx: TwdContext; limit: number }): Promise<RunSummary[]> =>
	(await listRunsWithEmail({ ctx, filter, limit })).map(toRunSummary);

const encodeCursor = ({ createdAt, id }: RunsCursor) =>
	Buffer.from(`${createdAt}|${id}`).toString("base64url");

const PG_TIMESTAMP = /^\d{4}-\d\d-\d\d[ T][\d:.]+(Z|[+-]\d\d(:?\d\d)?)?$/;

const invalidCursor = () =>
	new TwdError({
		status: 400,
		code: "invalid_cursor",
		message: "cursor is not a nextCursor this API returned.",
		next: "Drop cursor to start from the first page.",
	});

const decodeCursor = (cursor: string): RunsCursor => {
	const [createdAt, id] = Buffer.from(cursor, "base64url")
		.toString()
		.split("|");
	if (!createdAt || !id || !PG_TIMESTAMP.test(createdAt)) throw invalidCursor();
	return { createdAt, id };
};

const decodeBranchesCursor = (cursor: string): BranchesCursor => {
	const raw = Buffer.from(cursor, "base64url").toString();
	const split = raw.indexOf("|");
	const lastAt = raw.slice(0, split);
	const branch = raw.slice(split + 1);
	if (split < 0 || !branch || !PG_TIMESTAMP.test(lastAt)) throw invalidCursor();
	return { lastAt, branch };
};

export const listRunsPage = async ({
	ctx,
	cursor,
	limit,
	...filter
}: RunsFilter & { ctx: TwdContext; cursor?: string; limit: number }) => {
	const [rows, total] = await Promise.all([
		listRunsWithEmail({
			ctx,
			filter,
			cursor: cursor ? decodeCursor(cursor) : undefined,
			limit: limit + 1,
		}),
		countRuns({ ctx, filter }),
	]);
	const page = rows.slice(0, limit);
	const last = page.at(-1);
	return {
		runs: page.map(toRunSummary),
		nextCursor:
			rows.length > limit && last
				? encodeCursor({ createdAt: last.createdAtRaw, id: last.run.id })
				: null,
		total,
	};
};

/** Branches newest first by their latest finished run, each with its recent finished runs. */
export const listBranchesPage = async ({
	ctx,
	branch,
	cursor,
	limit,
}: {
	ctx: TwdContext;
	branch?: string;
	cursor?: string;
	limit: number;
}): Promise<BranchesPage> => {
	const { page, runsByBranch } = await listBranchHistories({
		ctx,
		branch,
		cursor: cursor ? decodeBranchesCursor(cursor) : undefined,
		limit: limit + 1,
	});
	const kept = page.slice(0, limit);
	const last = kept.at(-1);
	return {
		branches: kept.map(({ branch }) => ({
			branch,
			runs: runsByBranch.get(branch) ?? [],
		})),
		nextCursor:
			page.length > limit && last
				? Buffer.from(`${last.lastAt}|${last.branch}`).toString("base64url")
				: null,
	};
};
