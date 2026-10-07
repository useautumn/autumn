import type { RunDetail, RunFile } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { summariseRunResources } from "../../profiles/repos/fileRunStats.ts";
import { computeRunDrift } from "../../results/actions/computeRunDrift.ts";
import { getLiveRun } from "../live/liveRuns.ts";
import { summariseRepeats } from "../repeat/repetitions.ts";
import {
	getRunWithEmail,
	isTerminalRunStatus,
	toRunSummary,
} from "../repos/runsRepo.ts";
import { readRunProgress } from "../types/runProgress.ts";

/** Summary + live (or last persisted) worker grid + every planned file + drift. */
export const getRun = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<RunDetail> => {
	const found = await getRunWithEmail({ ctx, runId });
	const { run } = found;
	const progress = readRunProgress({ progress: run.progress });
	const live = getLiveRun({ runId });
	const eta = isTerminalRunStatus({ status: run.status }) ? null : live?.eta;
	const known = new Map<string, RunFile>(
		(live ? [...live.files.values()] : (progress.files ?? [])).map((file) => [
			file.file,
			file,
		]),
	);
	const files = (progress.plannedFiles ?? [...known.keys()]).map(
		(file) =>
			known.get(file) ?? {
				file,
				status: "queued" as const,
				durationMs: null,
				attempt: 0,
				passedTests: 0,
				failedTests: 0,
				worker: null,
				failureSummary: null,
			},
	);
	return {
		...toRunSummary(found),
		phase: live?.phase ?? progress.phase ?? null,
		workers: live ? [...live.workers.values()] : (progress.workers ?? []),
		files,
		repeats: run.repeat > 1 ? summariseRepeats({ files }) : [],
		drift: await computeRunDrift({ ctx, runId }),
		milestones: progress.milestones ?? null,
		etaMs: eta?.etaMs ?? null,
		etaP90Ms: eta?.etaP90Ms ?? null,
		resources: await summariseRunResources({ ctx, runId }),
		sizing: run.sizing ?? null,
	};
};
