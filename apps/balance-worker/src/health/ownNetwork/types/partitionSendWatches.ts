import type { InFlightWatch } from "./inFlightWatch.js";
import type { PartitionSendSample } from "./ownNetworkSample.js";

export type PartitionSendWatches = {
	watchFor(params: { partition: number }): InFlightWatch;
	take(params: { now: number }): PartitionSendSample[];
	readLastAckAgeMs(): number | null;
};
