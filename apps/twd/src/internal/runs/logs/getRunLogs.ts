import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { runLogs } from "../../../db/schema/runs.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getLiveRun } from "../live/liveRuns.ts";
import { splitRepetitionId, toRepetitionId } from "../repeat/repetitions.ts";
import { getRunWithEmail } from "../repos/runsRepo.ts";
import { readRunProgress } from "../types/runProgress.ts";
import { listFailedFiles } from "./listFailedFiles.ts";

const MAX_ROWS = 200_000;

const readChunks = async ({
	ctx,
	where,
}: {
	ctx: TwdContext;
	where: SQL | undefined;
}) =>
	(
		await ctx.db
			.select({ chunk: runLogs.chunk })
			.from(runLogs)
			.where(where)
			.orderBy(asc(runLogs.id))
			.limit(MAX_ROWS)
	)
		.map((row) => row.chunk)
		.join("");

/** Whole run, or one file (one repetition of it in a repeat run) / one worker / orchestrator-only. */
export const getRunLogs = async ({
	ctx,
	runId,
	file: requestedFile,
	repetition,
	worker,
	scope,
}: {
	ctx: TwdContext;
	runId: string;
	file?: string;
	repetition?: number;
	worker?: string;
	scope?: "run";
}): Promise<string> => {
	const {
		run: { repeat },
	} = await getRunWithEmail({ ctx, runId });
	const file =
		requestedFile && repetition !== undefined
			? toRepetitionId({ file: requestedFile, repetition })
			: requestedFile;
	if (
		file &&
		repeat > 1 &&
		splitRepetitionId({ id: file }).repetition === null
	) {
		throw new TwdError({
			status: 400,
			code: "repetition_required",
			message: `Run ${runId} repeats each file ${repeat} times; say which repetition's log you want.`,
			next: `Pass repetition (1-${repeat}) with file, or use the failed-files log.`,
		});
	}
	const filters = [eq(runLogs.runId, runId)];
	if (file) filters.push(eq(runLogs.file, file));
	if (worker) filters.push(eq(runLogs.worker, worker));
	if (scope === "run")
		filters.push(isNull(runLogs.file), isNull(runLogs.worker));
	const stored = await readChunks({ ctx, where: and(...filters) });
	if (stored || !file) return stored;
	// Runs from before run_logs existed: fall back to the in-memory ring / persisted tail.
	const live = getLiveRun({ runId })?.fileLogs.get(file);
	if (live !== undefined) return live;
	const { run } = await getRunWithEmail({ ctx, runId });
	return readRunProgress({ progress: run.progress }).fileLogTails?.[file] ?? "";
};

/** Every failed file's output, each under a header, ready to paste into an issue or agent. */
export const getFailedLogs = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	const failed = await listFailedFiles({ ctx, runId });
	if (failed.length === 0) return "No failed files in this run.\n";
	const rows = await ctx.db
		.select({ file: runLogs.file, chunk: runLogs.chunk })
		.from(runLogs)
		.where(
			and(
				eq(runLogs.runId, runId),
				inArray(
					runLogs.file,
					failed.map((f) => f.file),
				),
			),
		)
		.orderBy(asc(runLogs.id))
		.limit(MAX_ROWS);
	const byFile = new Map<string, string>();
	for (const row of rows)
		if (row.file)
			byFile.set(row.file, (byFile.get(row.file) ?? "") + row.chunk);
	const sections = await Promise.all(
		failed.map(async (f) => {
			const text =
				byFile.get(f.file) ?? (await getRunLogs({ ctx, runId, file: f.file }));
			const meta = [f.status, `attempt ${f.attempt}`, f.worker]
				.filter(Boolean)
				.join(" · ");
			return `===== ${f.file} (${meta}) =====\n${f.failureSummary ? `${f.failureSummary}\n\n` : ""}${text.trimEnd()}\n`;
		}),
	);
	return sections.join("\n");
};
