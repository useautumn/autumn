import type {
	RunFile,
	RunMilestones,
	WorkerState,
} from "../../../api/contract.ts";

export type RunProgress = {
	phase?: string | null;
	plannedFiles?: string[];
	workers?: WorkerState[];
	files?: RunFile[];
	fileLogTails?: Record<string, string>;
	error?: string;
	milestones?: RunMilestones;
};

export const readRunProgress = ({
	progress,
}: {
	progress: Record<string, unknown>;
}): RunProgress => progress as RunProgress;
