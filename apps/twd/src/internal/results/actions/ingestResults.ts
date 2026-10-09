import { eq } from "drizzle-orm";
import { testResults } from "../../../db/schema/results.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type {
	IngestResultsBody,
	IngestResultsResponse,
} from "../types/resultsSchemas.ts";
import { BASELINE_BRANCH, refreshBaselines } from "./refreshBaselines.ts";
import { toTestId } from "./toTestId.ts";

const INSERT_CHUNK = 1_000;

/** Stores a CI run's per-file results as source=ci rows; re-posting the same ciRunId replaces them. */
export const ingestResults = async ({
	ctx,
	body,
}: {
	ctx: TwdContext;
	body: IngestResultsBody;
}): Promise<IngestResultsResponse> => {
	const runId = `ci_${body.ciRunId}`;
	const rows = body.results.map((r) => ({
		id: `tr_${crypto.randomUUID().replaceAll("-", "")}`,
		runId,
		branch: body.branch,
		sha: body.sha,
		file: toTestId({ file: r.file }),
		status: r.status,
		durationMs: Math.round(r.durationMs),
		attempt: r.attempt,
		passedTests: r.passedTests,
		failedTests: r.failedTests,
		failureSummary: r.failureSummary,
		source: body.source,
	}));

	await ctx.db.transaction(async (tx) => {
		await tx.delete(testResults).where(eq(testResults.runId, runId));
		for (let i = 0; i < rows.length; i += INSERT_CHUNK)
			await tx.insert(testResults).values(rows.slice(i, i + INSERT_CHUNK));
	});

	const baselinesRefreshed = body.branch === BASELINE_BRANCH;
	if (baselinesRefreshed) await refreshBaselines({ ctx });
	ctx.logger.info("ci results ingested", {
		runId,
		branch: body.branch,
		sha: body.sha,
		files: rows.length,
		via: ctx.actor?.via,
	});
	return { runId, inserted: rows.length, baselinesRefreshed };
};
