import { inArray } from "drizzle-orm";
import type { RunFile } from "../../../api/contract.ts";
import {
	type FileResultStatus,
	fileBaselines,
	testResults,
} from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

/** Frozen cross-task API for results. OWNED BY THE RESULTS TASK. */

const FINAL_STATUSES: FileResultStatus[] = [
	"passed",
	"failed",
	"crashed",
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

	await ctx.db.insert(testResults).values({
		id: `tr_${crypto.randomUUID().replaceAll("-", "")}`,
		runId,
		branch,
		sha,
		file: result.file,
		status,
		durationMs: Math.round(result.durationMs ?? 0),
		attempt: result.attempt,
		passedTests: result.passedTests,
		failedTests: result.failedTests,
		worker: result.worker,
		failureSummary: result.failureSummary,
	});
};

/** Longest-first by baseline p90; files without history first. */
export const orderFilesLongestFirst = async ({
	ctx,
	files,
}: {
	ctx: TwdContext;
	files: string[];
}): Promise<string[]> => {
	if (files.length === 0) return [];

	const baselines = await ctx.db
		.select({ file: fileBaselines.file, p90Ms: fileBaselines.p90Ms })
		.from(fileBaselines)
		.where(inArray(fileBaselines.file, files));
	const p90ByFile = new Map(baselines.map((b) => [b.file, b.p90Ms]));

	const unseen = files.filter((f) => !p90ByFile.has(f));
	const seen = files
		.filter((f) => p90ByFile.has(f))
		.sort((a, b) => (p90ByFile.get(b) ?? 0) - (p90ByFile.get(a) ?? 0));
	return [...unseen, ...seen];
};
