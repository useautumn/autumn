import { type ByocCacheDeployment, ByocCacheStatus } from "@autumn/shared";
import {
	isCacheConnected,
	isCacheSettled,
} from "../../../../utils/classifyCacheDeployment.js";
import type {
	CacheDeploymentPoll,
	WatchCacheDeploymentOutcome,
	WatchCacheDeploymentStep,
} from "../types/watchCacheDeploymentTypes.js";

/** Slow while the org works in AWS, faster as alien provisions, fastest until Autumn reaches it. */
const WATCH_POLL_SECONDS: Record<ByocCacheStatus, number> = {
	[ByocCacheStatus.AwaitingSetup]: 15,
	[ByocCacheStatus.Provisioning]: 10,
	[ByocCacheStatus.Ready]: 5,
	[ByocCacheStatus.Failed]: 10,
	[ByocCacheStatus.Removing]: 10,
	[ByocCacheStatus.TeardownRequired]: 15,
};

/** Each poll alien misses doubles the wait from here, up to the cap. */
const WATCH_BACKOFF_BASE_SECONDS = 10;
const WATCH_BACKOFF_MAX_SECONDS = 120;

const settledOutcome = ({
	cacheDeployment,
}: {
	cacheDeployment: ByocCacheDeployment;
}): WatchCacheDeploymentOutcome => {
	if (isCacheConnected({ cacheDeployment })) return "connected";
	if (cacheDeployment.status === ByocCacheStatus.TeardownRequired)
		return "teardown_required";
	return "failed";
};

const backoffSeconds = ({ failedPolls }: { failedPolls: number }) =>
	Math.min(
		WATCH_BACKOFF_BASE_SECONDS * 2 ** (failedPolls - 1),
		WATCH_BACKOFF_MAX_SECONDS,
	);

/** Stop once the Atom settles or its record is gone; otherwise wait as long as its status calls for. */
export const computeNextWatchStep = ({
	poll,
	failedPolls,
}: {
	poll: CacheDeploymentPoll;
	failedPolls: number;
}): WatchCacheDeploymentStep => {
	if (!poll.ok)
		return { settled: false, waitSeconds: backoffSeconds({ failedPolls }) };

	const { cacheDeployment } = poll;
	if (!cacheDeployment) return { settled: true, outcome: "gone" };
	if (isCacheSettled({ cacheDeployment }))
		return { settled: true, outcome: settledOutcome({ cacheDeployment }) };
	return {
		settled: false,
		waitSeconds: WATCH_POLL_SECONDS[cacheDeployment.status],
	};
};
