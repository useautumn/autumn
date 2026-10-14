import { ByocCacheStatus } from "@autumn/shared";
import {
	isCacheConnected,
	isCacheSettled,
} from "../../../utils/classifyCacheDeployment.js";
import type { AtomRecord } from "../../types/atomRecord.js";
import type {
	AtomRecordPoll,
	WatchAtomRecordOutcome,
	WatchAtomRecordStep,
} from "../types/watchAtomRecordTypes.js";

const WATCH_POLL_SECONDS: Record<ByocCacheStatus, number> = {
	[ByocCacheStatus.AwaitingSetup]: 15,
	[ByocCacheStatus.Provisioning]: 10,
	[ByocCacheStatus.Ready]: 5,
	[ByocCacheStatus.Failed]: 10,
	[ByocCacheStatus.Removing]: 10,
	[ByocCacheStatus.TeardownRequired]: 15,
};

const WATCH_BACKOFF_BASE_SECONDS = 10;
const WATCH_BACKOFF_MAX_SECONDS = 120;

const settledOutcome = ({
	record,
}: {
	record: AtomRecord;
}): WatchAtomRecordOutcome => {
	if (isCacheConnected({ cacheDeployment: record })) return "connected";
	if (record.status === ByocCacheStatus.TeardownRequired)
		return "teardown_required";
	return "failed";
};

const backoffSeconds = ({ failedPolls }: { failedPolls: number }) =>
	Math.min(
		WATCH_BACKOFF_BASE_SECONDS * 2 ** (failedPolls - 1),
		WATCH_BACKOFF_MAX_SECONDS,
	);

export const computeNextWatchStep = ({
	poll,
	failedPolls,
}: {
	poll: AtomRecordPoll<AtomRecord>;
	failedPolls: number;
}): WatchAtomRecordStep => {
	if (!poll.ok)
		return { settled: false, waitSeconds: backoffSeconds({ failedPolls }) };

	const { record } = poll;
	if (!record) return { settled: true, outcome: "gone" };
	if (isCacheSettled({ cacheDeployment: record }))
		return { settled: true, outcome: settledOutcome({ record }) };
	return { settled: false, waitSeconds: WATCH_POLL_SECONDS[record.status] };
};
