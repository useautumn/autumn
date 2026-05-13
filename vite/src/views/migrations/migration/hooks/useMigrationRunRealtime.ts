import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { useCallback } from "react";

export type RealtimeRunSubscription = {
	triggerRunId: string;
	publicAccessToken: string;
	isDryRun: boolean;
};

export type RealtimeRunStatus = "queued" | "running" | "succeeded" | "failed";

function resolveRunStatus(run: {
	isQueued: boolean;
	isExecuting: boolean;
	isSuccess: boolean;
	isFailed: boolean;
	isCancelled: boolean;
}): RealtimeRunStatus | null {
	if (run.isQueued) return "queued";
	if (run.isExecuting) return "running";
	if (run.isSuccess) return "succeeded";
	if (run.isFailed || run.isCancelled) return "failed";
	return null;
}

export function useMigrationRunRealtime({
	triggerRunId,
	publicAccessToken,
	onComplete,
}: {
	triggerRunId: string;
	publicAccessToken: string;
	onComplete: () => void;
}): { status: RealtimeRunStatus | null; isActive: boolean } {
	const stableOnComplete = useCallback(onComplete, [onComplete]);

	const { run } = useRealtimeRun(triggerRunId, {
		accessToken: publicAccessToken,
		skipColumns: ["payload", "output"],
		onComplete: stableOnComplete,
	});

	if (!run) return { status: null, isActive: false };

	const status = resolveRunStatus(run);
	return { status, isActive: run.isQueued || run.isExecuting };
}
