import { and, eq, inArray } from "drizzle-orm";
import type { RunFile } from "../../../api/contract.ts";
import {
	type FileResultStatus,
	fileBaselines,
	testResults,
} from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { splitRepetitionId } from "../../runs/repeat/repetitions.ts";

/** Frozen cross-task API for results. OWNED BY THE RESULTS TASK. */

const FINAL_STATUSES: FileResultStatus[] = [
	"passed",
	"failed",
	"crashed",
	"timed_out",
	"skipped",
];

/** Append one finished-file row to test_results. */
export const recordFileResult = async ({
	ctx,
	runId,
	branch,
	sha,
	result,
}: {
	ctx: TwdContext;
	runId: string;
	branch: string;
	sha: string;
	result: RunFile;
}): Promise<void> => {
	const status = FINAL_STATUSES.find((s) => s === result.status);
	if (!status) {
		ctx.logger.warn("recordFileResult: ignoring non-final file status", {
			runId,
			file: result.file,
			status: result.status,
		});
		return;
	}

	const { file, repetition } = splitRepetitionId({ id: result.file });
	await ctx.db.insert(testResults).values({
		id: `tr_${crypto.randomUUID().replaceAll("-", "")}`,
		runId,
		branch,
		sha,
		file,
		repetition,
		status,
		durationMs: Math.round(result.durationMs ?? 0),
		attempt: result.attempt,
		passedTests: result.passedTests,
		failedTests: result.failedTests,
		worker: result.worker,
		failureSummary: result.failureSummary,
	});
};

/** Longest-first by baseline p90; files without history first. Repetitions sort with their file. */
export const orderFilesLongestFirst = async ({
	ctx,
	files,
}: {
	ctx: TwdContext;
	files: string[];
}): Promise<string[]> => {
	if (files.length === 0) return [];

	const baseOf = (id: string) => splitRepetitionId({ id }).file;
	const baselines = await ctx.db
		.select({ file: fileBaselines.file, p90Ms: fileBaselines.p90Ms })
		.from(fileBaselines)
		.where(
			and(
				eq(fileBaselines.source, "swarm"),
				inArray(fileBaselines.file, [...new Set(files.map(baseOf))]),
			),
		);
	const p90ByBase = new Map(baselines.map((b) => [b.file, b.p90Ms]));
	const p90ByFile = new Map(
		files.flatMap((f) => {
			const p90 = p90ByBase.get(baseOf(f));
			return p90 === undefined ? [] : [[f, p90] as const];
		}),
	);

	const unseen = files.filter((f) => !p90ByFile.has(f));
	const seen = files
		.filter((f) => p90ByFile.has(f))
		.sort((a, b) => (p90ByFile.get(b) ?? 0) - (p90ByFile.get(a) ?? 0));
	return [...unseen, ...seen];
};
