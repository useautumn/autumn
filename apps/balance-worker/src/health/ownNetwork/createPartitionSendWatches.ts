import { createInFlightWatch } from "./createInFlightWatch.js";
import type { InFlightWatch } from "./types/inFlightWatch.js";
import type { PartitionSendSample } from "./types/ownNetworkSample.js";
import type { PartitionSendWatches } from "./types/partitionSendWatches.js";

export function createPartitionSendWatches({
	now = () => performance.now(),
	wallNow = Date.now,
}: {
	now?: () => number;
	wallNow?: () => number;
} = {}): PartitionSendWatches {
	const watches = new Map<number, InFlightWatch>();
	const state: { lastAckAt: number | null } = { lastAckAt: null };

	function noteSettled({ ok }: { ok: boolean }): void {
		if (ok) state.lastAckAt = wallNow();
	}

	function watchFor({ partition }: { partition: number }): InFlightWatch {
		const existing = watches.get(partition);
		if (existing) return existing;
		const watch = createInFlightWatch({ now, onSettled: noteSettled });
		watches.set(partition, watch);
		return watch;
	}

	function take({ now: at }: { now: number }): PartitionSendSample[] {
		const samples: PartitionSendSample[] = [];
		for (const [partition, watch] of watches) {
			const longestInFlightMs = watch.takeLongestMs({ now: at });
			if (longestInFlightMs !== null)
				samples.push({ partition, longestInFlightMs });
		}
		return samples;
	}

	function readLastAckAt(): number | null {
		return state.lastAckAt;
	}

	return { watchFor, take, readLastAckAt };
}
