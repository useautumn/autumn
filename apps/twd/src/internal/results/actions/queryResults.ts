import { and, asc, desc, eq } from "drizzle-orm";
import { fileBaselines, testResults } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { FileBaseline, FileHistory } from "../types/resultsSchemas.ts";

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

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};

/** A file's recent results (optionally one branch), its dev baseline, and a per-commit rollup. */
export const getFileHistory = async ({
	ctx,
	file,
	branch,
	limit = 100,
}: {
	ctx: TwdContext;
	file: string;
	branch?: string;
	limit?: number;
}): Promise<FileHistory> => {
	const [baseline] = await ctx.db
		.select()
		.from(fileBaselines)
		.where(eq(fileBaselines.file, file));
	const results = await ctx.db
		.select()
		.from(testResults)
		.where(
			and(
				eq(testResults.file, file),
				branch ? eq(testResults.branch, branch) : undefined,
			),
		)
		.orderBy(desc(testResults.createdAt))
		.limit(limit);

	const bySha = new Map<string, typeof results>();
	for (const r of [...results].reverse())
		bySha.set(r.sha, [...(bySha.get(r.sha) ?? []), r]);
	const byCommit = [...bySha].map(([sha, rows]) => ({
		sha,
		branch: rows.at(-1)?.branch ?? "",
		runs: rows.length,
		p50Ms: median(rows.map((r) => r.durationMs)),
		maxMs: Math.max(...rows.map((r) => r.durationMs)),
		passRate: rows.filter((r) => r.status === "passed").length / rows.length,
		firstAt: rows[0]?.createdAt.toISOString() ?? "",
		lastAt: rows.at(-1)?.createdAt.toISOString() ?? "",
	}));

	return {
		file,
		baseline: baseline ? toFileBaseline(baseline) : null,
		results: results.map(({ id: _id, file: _file, ...r }) => ({
			...r,
			createdAt: r.createdAt.toISOString(),
		})),
		byCommit,
	};
};
