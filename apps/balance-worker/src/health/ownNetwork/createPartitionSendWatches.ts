import { createInFlightWatch } from "./createInFlightWatch.js";
import type { InFlightWatch } from "./types/inFlightWatch.js";
import type { PartitionSendSample } from "./types/ownNetworkSample.js";
import type {
	PartitionHolding,
	PartitionSendWatches,
} from "./types/partitionSendWatches.js";

export function createPartitionSendWatches({
	ctx,
}: {
	ctx: {
		holdingOf(params: { partition: number }): number | undefined;
		now?: () => number;
	};
}): PartitionSendWatches {
	const now = ctx.now ?? (() => performance.now());
	const watches = new Map<
		string,
		PartitionHolding & { watch: InFlightWatch }
	>();

	function watchOf({ partition, holding }: PartitionHolding): InFlightWatch {
		const key = `${partition}:${holding}`;
		const existing = watches.get(key);
		if (existing) return existing.watch;
		const watch = createInFlightWatch({ now });
		watches.set(key, { partition, holding, watch });
		return watch;
	}

	function watchFor({
		partition,
	}: {
		partition: number;
	}): Pick<InFlightWatch, "track"> {
		function track<Value>(work: () => Promise<Value>): Promise<Value> {
			const holding = ctx.holdingOf({ partition });
			if (holding === undefined) return work();
			return watchOf({ partition, holding }).track(work);
		}
		return { track };
	}

	function take({
		now: at,
		isCurrent,
	}: {
		now: number;
		isCurrent(holding: PartitionHolding): boolean;
	}): PartitionSendSample[] {
		const samples: PartitionSendSample[] = [];
		for (const [key, { partition, holding, watch }] of watches) {
			if (!isCurrent({ partition, holding })) {
				watches.delete(key);
				continue;
			}
			const longestInFlightMs = watch.takeLongestMs({ now: at });
			if (longestInFlightMs !== null)
				samples.push({ partition, holding, longestInFlightMs });
		}
		return samples;
	}

	return { watchFor, take };
}
