import { asc, desc, eq } from "drizzle-orm";
import { fileBaselines, testResults } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { FileBaseline, FileHistory } from "../types/resultsSchemas.ts";

const HISTORY_LIMIT = 50;

const toFileBaseline = (
	row: typeof fileBaselines.$inferSelect,
): FileBaseline => ({ ...row, updatedAt: row.updatedAt.toISOString() });

export const listBaselines = async ({
	ctx,
	sort,
	order,
	limit,
}: {
	ctx: TwdContext;
	sort: "file" | "p50Ms" | "p90Ms" | "passRate" | "samples";
	order: "asc" | "desc";
	limit: number;
}): Promise<FileBaseline[]> => {
	const rows = await ctx.db
		.select()
		.from(fileBaselines)
		.orderBy(
			(order === "asc" ? asc : desc)(fileBaselines[sort]),
			asc(fileBaselines.file),
		)
		.limit(limit);
	return rows.map(toFileBaseline);
};

/** Last 50 results for a file across every branch, plus its dev baseline. */
export const getFileHistory = async ({
	ctx,
	file,
}: {
	ctx: TwdContext;
	file: string;
}): Promise<FileHistory> => {
	const [baseline] = await ctx.db
		.select()
		.from(fileBaselines)
		.where(eq(fileBaselines.file, file));
	const results = await ctx.db
		.select()
		.from(testResults)
		.where(eq(testResults.file, file))
		.orderBy(desc(testResults.createdAt))
		.limit(HISTORY_LIMIT);

	return {
		file,
		baseline: baseline ? toFileBaseline(baseline) : null,
		results: results.map(({ id: _id, file: _file, ...r }) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		})),
	};
};
