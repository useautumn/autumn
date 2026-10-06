import { isFailedFileStatus, type RunSummary } from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { splitRepetitionId } from "../repeat/repetitions.ts";
import { createRun } from "./createRun.ts";
import { getRun } from "./getRun.ts";

/** New run on the same branch + sha with only the failed, crashed and timed-out files. */
export const rerunFailed = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<RunSummary> => {
	const run = await getRun({ ctx, runId });
	const failed = [
		...new Set(
			run.files
				.filter((file) => isFailedFileStatus(file.status))
				.map((file) => splitRepetitionId({ id: file.file }).file),
		),
	];
	if (failed.length === 0) {
		throw new TwdError({
			status: 409,
			code: "no_failed_files",
			message: `Run ${runId} has no failed, crashed or timed-out files${run.finishedAt ? "" : " yet"}.`,
			next: run.finishedAt
				? "Nothing to rerun."
				: "Wait for the run to finish (GET /runs/:id), then retry.",
		});
	}
	return createRun({
		ctx,
		branch: run.branch,
		sha: run.sha,
		selection: { files: failed, grep: run.selection.grep },
		repeat: run.repeat,
	});
};
