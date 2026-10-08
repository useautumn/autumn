import {
	BYOC_CACHE_STAGES,
	type ByocCacheDeployment,
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

/** A record from before stages were kept reads as not started. */
export const cacheDeploymentToStages = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}): ByocCacheStages =>
	cacheDeployment.stages ??
	toCacheStages({ doneStages: [], status: cacheDeployment.status });
