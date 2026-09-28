import type { RunSummary } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	countRuns,
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

const decodeCursor = (cursor: string): RunsCursor => {
	const [createdAt, id] = Buffer.from(cursor, "base64url")
		.toString()
		.split("|");
	if (!createdAt || !id || !PG_TIMESTAMP.test(createdAt))
		throw new TwdError({
			status: 400,
			code: "invalid_cursor",
			message: "cursor is not a nextCursor this API returned.",
			next: "Drop cursor to start from the first page.",
		});
	return { createdAt, id };
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
