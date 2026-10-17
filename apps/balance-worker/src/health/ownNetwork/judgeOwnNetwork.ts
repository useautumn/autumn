import {
	BALANCE_WORKER_OWN_NETWORK_MIN_RETRANSMITS,
	BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
	BALANCE_WORKER_OWN_NETWORK_RETRANSMIT_RATIO,
	BALANCE_WORKER_OWN_NETWORK_STALL_MS,
	BALANCE_WORKER_OWN_NETWORK_WINDOW_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { OwnNetworkSample } from "./types/ownNetworkSample.js";
import type { OwnNetworkVerdict } from "./types/ownNetworkVerdict.js";

export type OwnNetworkThresholds = {
	windowMs: number;
	minRetransmits: number;
	retransmitRatio: number;
	stallMs: number;
	minStalledPartitions: number;
};

export const DEFAULT_OWN_NETWORK_THRESHOLDS: OwnNetworkThresholds = {
	windowMs: BALANCE_WORKER_OWN_NETWORK_WINDOW_MS,
	minRetransmits: BALANCE_WORKER_OWN_NETWORK_MIN_RETRANSMITS,
	retransmitRatio: BALANCE_WORKER_OWN_NETWORK_RETRANSMIT_RATIO,
	stallMs: BALANCE_WORKER_OWN_NETWORK_STALL_MS,
	minStalledPartitions: BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
};

export function judgeOwnNetwork({
	samples,
	now,
	heldPartitions,
	thresholds = DEFAULT_OWN_NETWORK_THRESHOLDS,
}: {
	samples: readonly OwnNetworkSample[];
	now: number;
	heldPartitions: number;
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
	const longest = longestSendByHolding({ window });
	const stalledHoldings: { partition: number; holding: number }[] = [];
	for (const { partition, holding, longestMs } of longest.values())
		if (longestMs >= thresholds.stallMs)
			stalledHoldings.push({ partition, holding });
	const busyPartitions = new Set(
		[...longest.values()].map(({ partition }) => partition),
	).size;
	const retransmitRatio = segments > 0 ? retransmitted / segments : null;
	const losesPackets =
		retransmitted >= thresholds.minRetransmits &&
		(retransmitRatio ?? 0) >= thresholds.retransmitRatio;
	const verdict = {
		at: now,
		windowStartedAt: window[0]?.at ?? null,
		segments,
		retransmitRatio,
		busyPartitions,
		stalledPartitions: stalledHoldings.length,
		heldPartitions,
		stalledHoldings,
		losesPackets,
	};
	const coversWindow =
		(samples[0]?.at ?? Number.POSITIVE_INFINITY) <= windowStart;
	const countersComplete = window.every((sample) => sample.tcp !== null);
	if (!coversWindow || !countersComplete || segments === 0)
		return { ...verdict, state: "insufficient_data" };
	const stuck = sendsStuckOnMostHeldPartitions({
		heldPartitions: Math.max(heldPartitions, busyPartitions),
		stalledPartitions: stalledHoldings.length,
		thresholds,
	});
	return { ...verdict, state: losesPackets && stuck ? "degraded" : "healthy" };
}

function longestSendByHolding({
	window,
}: {
	window: readonly OwnNetworkSample[];
}): Map<string, { partition: number; holding: number; longestMs: number }> {
	const longest = new Map<
		string,
		{ partition: number; holding: number; longestMs: number }
	>();
	for (const { sends } of window)
		for (const { partition, holding, longestInFlightMs } of sends) {
			const key = `${partition}:${holding}`;
			const known = longest.get(key);
			longest.set(key, {
				partition,
				holding,
				longestMs: Math.max(known?.longestMs ?? 0, longestInFlightMs),
			});
		}
	return longest;
}

function sendsStuckOnMostHeldPartitions({
	heldPartitions,
	stalledPartitions,
	thresholds,
}: {
	heldPartitions: number;
	stalledPartitions: number;
	thresholds: OwnNetworkThresholds;
}): boolean {
	return (
		stalledPartitions >= thresholds.minStalledPartitions &&
		stalledPartitions * 2 > heldPartitions
	);
}
