import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import { eq } from "drizzle-orm";
import {
	type FileResultStatus,
	testResults,
} from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { listFirstAttemptStats } from "../repos/fileRunStats.ts";
import type { FileProfileSample } from "../types/fileProfileSample.ts";
import { combineRunSamples, statsToProfileMetrics } from "./foldFileProfile.ts";

type FinalResult = {
	file: string;
	repetition: number | null;
	status: FileResultStatus;
	attempt: number;
	durationMs: number;
};
type FirstAttemptStats = {
	file: string;
	repetition: number | null;
	stats: FileStats;
};

const workItemKey = ({
	file,
	repetition,
}: {
	file: string;
	repetition: number | null;
}) => `${file}#${repetition ?? 0}`;

/** First attempt from its stats line; without one, only a final result that was itself attempt 1. */
const toSample = ({
	result,
	stats,
}: {
	result: FinalResult | undefined;
	stats: FileStats | undefined;
}): FileProfileSample | null => {
	if (result?.status === "skipped") return null;
	const hung = result?.status === "timed_out" || result?.status === "crashed";
	if (stats)
		return {
			durationMs: stats.wallMs,
			failure: stats.exitCode === 0 ? 0 : 1,
			hung,
			packed: stats.concurrentMax > 1,
			metrics: statsToProfileMetrics(stats),
		};
	if (!result || result.attempt !== 1) return null;
	return {
		durationMs: result.durationMs,
		failure: result.status === "passed" ? 0 : 1,
		hung,
		packed: false,
		metrics: null,
	};
};

/** Pure: one combined first-attempt sample per file. */
export const buildRunSamples = ({
	results,
	statsRows,
}: {
	results: FinalResult[];
	statsRows: FirstAttemptStats[];
}): Map<string, FileProfileSample> => {
	const statsByItem = new Map(
		statsRows.map((row) => [workItemKey(row), row.stats]),
	);
	const resultByItem = new Map(results.map((row) => [workItemKey(row), row]));
	const items = new Map<string, { file: string; repetition: number | null }>();
	for (const row of [...results, ...statsRows])
		items.set(workItemKey(row), { file: row.file, repetition: row.repetition });

	const samplesByFile = new Map<string, FileProfileSample[]>();
	for (const [key, { file }] of items) {
		const sample = toSample({
			result: resultByItem.get(key),
			stats: statsByItem.get(key),
		});
		if (!sample) continue;
		samplesByFile.set(file, [...(samplesByFile.get(file) ?? []), sample]);
	}
	return new Map(
		[...samplesByFile].map(([file, samples]) => [
			file,
			combineRunSamples(samples),
		]),
	);
};

export const collectRunSamples = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	const [results, statsRows] = await Promise.all([
		ctx.db
			.select({
				file: testResults.file,
				repetition: testResults.repetition,
				status: testResults.status,
				attempt: testResults.attempt,
				durationMs: testResults.durationMs,
			})
			.from(testResults)
			.where(eq(testResults.runId, runId)),
		listFirstAttemptStats({ ctx, runId }),
	]);
	return buildRunSamples({ results, statsRows });
};
