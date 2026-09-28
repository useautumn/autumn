import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getLiveRun } from "../live/liveRuns.ts";
import { getRunWithEmail } from "../repos/runsRepo.ts";
import { readRunProgress } from "../types/runProgress.ts";

/** Live output ring while the run is in memory; else the tail persisted at finish. */
export const getFileLog = async ({
	ctx,
	runId,
	file,
}: {
	ctx: TwdContext;
	runId: string;
	file: string;
}): Promise<string> => {
	const live = getLiveRun({ runId })?.fileLogs.get(file);
	if (live !== undefined) return live;
	const { run } = await getRunWithEmail({ ctx, runId });
	return readRunProgress({ progress: run.progress }).fileLogTails?.[file] ?? "";
};
