import type { InFlightWatch } from "./inFlightWatch.js";
import type { PartitionSendSample } from "./ownNetworkSample.js";

export type PartitionHolding = { partition: number; holding: number };

export type PartitionSendWatches = {
	watchFor(params: { partition: number }): Pick<InFlightWatch, "track">;
	take(params: {
		now: number;
		isCurrent(holding: PartitionHolding): boolean;
	}): PartitionSendSample[];
};
