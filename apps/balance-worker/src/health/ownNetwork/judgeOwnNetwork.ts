import {
	BALANCE_WORKER_OWN_NETWORK_MIN_SEGMENTS,
	BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
	BALANCE_WORKER_OWN_NETWORK_RETRANSMIT_RATIO,
	BALANCE_WORKER_OWN_NETWORK_STALL_MS,
	BALANCE_WORKER_OWN_NETWORK_WINDOW_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { OwnNetworkSample } from "./types/ownNetworkSample.js";
import type {
	OwnNetworkState,
	OwnNetworkVerdict,
} from "./types/ownNetworkVerdict.js";

export type OwnNetworkThresholds = {
	windowMs: number;
	minSegments: number;
	retransmitRatio: number;
	stallMs: number;
	minStalledPartitions: number;
};

export const DEFAULT_OWN_NETWORK_THRESHOLDS: OwnNetworkThresholds = {
	windowMs: BALANCE_WORKER_OWN_NETWORK_WINDOW_MS,
	minSegments: BALANCE_WORKER_OWN_NETWORK_MIN_SEGMENTS,
	retransmitRatio: BALANCE_WORKER_OWN_NETWORK_RETRANSMIT_RATIO,
	stallMs: BALANCE_WORKER_OWN_NETWORK_STALL_MS,
	minStalledPartitions: BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
};

export function judgeOwnNetwork({
	samples,
	now,
	thresholds = DEFAULT_OWN_NETWORK_THRESHOLDS,
}: {
	samples: readonly OwnNetworkSample[];
	now: number;
	thresholds?: OwnNetworkThresholds;
}): OwnNetworkVerdict {
	const windowStart = now - thresholds.windowMs;
	const window = samples.filter((sample) => sample.at > windowStart);
	let segments = 0;
	let retransmitted = 0;
	for (const { tcp } of window) {
		segments += tcp?.outSegs ?? 0;
		retransmitted += tcp?.retransSegs ?? 0;
	}
	const longestByPartition = longestSendByPartition({ window });
	const stalledPartitions = [...longestByPartition.values()].filter(
		(longestMs) => longestMs >= thresholds.stallMs,
	).length;
	const retransmitRatio = segments > 0 ? retransmitted / segments : null;
	const verdict = {
		at: now,
		windowStartedAt: window[0]?.at ?? null,
		segments,
		retransmitRatio,
		busyPartitions: longestByPartition.size,
		stalledPartitions,
	};
	const coversWindow =
		(samples[0]?.at ?? Number.POSITIVE_INFINITY) <= windowStart;
	const countersComplete = window.every((sample) => sample.tcp !== null);
	if (!coversWindow || !countersComplete || segments < thresholds.minSegments)
		return { ...verdict, state: "insufficient_data" };
	return {
		...verdict,
		state: stateOf({
			retransmitRatio: retransmitRatio ?? 0,
			busyPartitions: longestByPartition.size,
			stalledPartitions,
			thresholds,
		}),
	};
}

function longestSendByPartition({
	window,
}: {
	window: readonly OwnNetworkSample[];
}): Map<number, number> {
	const longestByPartition = new Map<number, number>();
	for (const { sends } of window)
		for (const { partition, longestInFlightMs } of sends)
			longestByPartition.set(
				partition,
				Math.max(longestByPartition.get(partition) ?? 0, longestInFlightMs),
			);
	return longestByPartition;
}

function stateOf({
	retransmitRatio,
	busyPartitions,
	stalledPartitions,
	thresholds,
}: {
	retransmitRatio: number;
	busyPartitions: number;
	stalledPartitions: number;
	thresholds: OwnNetworkThresholds;
}): OwnNetworkState {
	const losesPackets = retransmitRatio >= thresholds.retransmitRatio;
	const sendsStuckOnMostPartitions =
		stalledPartitions >= thresholds.minStalledPartitions &&
		stalledPartitions * 2 > busyPartitions;
	return losesPackets && sendsStuckOnMostPartitions ? "degraded" : "healthy";
}
