import {
	BYOC_CACHE_REMOVAL_STAGES,
	BYOC_CACHE_STAGES,
	type ByocCacheStage,
	ByocCacheStageStatus,
	type ByocCacheStages,
	ByocCacheStatus,
} from "@autumn/shared";

/** Where the step after the last done one stands: it failed, waits on the org, or is under way. */
const nextStageStatus = ({
	status,
}: {
	status: ByocCacheStatus;
}): ByocCacheStageStatus => {
	if (status === ByocCacheStatus.Failed) return ByocCacheStageStatus.Failed;
	const isUnderWay =
		status === ByocCacheStatus.Provisioning || status === ByocCacheStatus.Ready;
	return isUnderWay
		? ByocCacheStageStatus.Running
		: ByocCacheStageStatus.Waiting;
};

/** Every step before the furthest one done is done too, so the table only ever moves forward. */
export const toCacheStages = ({
	doneStages,
	status,
}: {
	doneStages: readonly ByocCacheStage[];
	status: ByocCacheStatus;
}): ByocCacheStages => {
	const furthestDone = Math.max(
		-1,
		...doneStages.map((stage) => BYOC_CACHE_STAGES.indexOf(stage)),
	);
	const stageStatusAt = (index: number): ByocCacheStageStatus => {
		if (index <= furthestDone) return ByocCacheStageStatus.Done;
		if (index === furthestDone + 1) return nextStageStatus({ status });
		return ByocCacheStageStatus.Waiting;
	};
	return Object.fromEntries(
		BYOC_CACHE_STAGES.map((stage, index) => [stage, stageStatusAt(index)]),
	) as ByocCacheStages;
};

/** Removed stages are done; the rest are under way, or the first is where a failed delete stopped. Setup-only stages read as done. */
export const toRemovalStages = ({
	removedStages,
	hasFailed,
}: {
	removedStages: readonly ByocCacheStage[];
	hasFailed: boolean;
}): ByocCacheStages => {
	const remaining = BYOC_CACHE_REMOVAL_STAGES.filter(
		(stage) => !removedStages.includes(stage),
	);
	const stageStatus = (stage: ByocCacheStage): ByocCacheStageStatus => {
		if (!remaining.includes(stage)) return ByocCacheStageStatus.Done;
		if (!hasFailed) return ByocCacheStageStatus.Running;
		return stage === remaining[0]
			? ByocCacheStageStatus.Failed
			: ByocCacheStageStatus.Waiting;
	};
	return Object.fromEntries(
		BYOC_CACHE_STAGES.map((stage) => [stage, stageStatus(stage)]),
	) as ByocCacheStages;
};
