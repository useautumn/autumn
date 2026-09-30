import type {
	RunFile,
	RunMilestones,
	WorkerState,
} from "../../../api/contract.ts";

/** Shape of `runs.progress` (jsonb). Written by createRun + the swarm job. */
export type RunProgress = {
	phase?: string | null;
	/** server/tests-relative files resolved at creation, in scheduling order. */
	plannedFiles?: string[];
	workers?: WorkerState[];
	files?: RunFile[];
	/** Output tail for non-passing files, persisted when the run finishes. */
	fileLogTails?: Record<string, string>;
	error?: string;
	milestones?: RunMilestones;
};

export const readRunProgress = ({
	progress,
}: {
	progress: Record<string, unknown>;
}): RunProgress => progress as RunProgress;
