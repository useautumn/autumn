import type { TrackCommand, TrackDecision } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerTrackRequest = {
	route: PartitionRoute;
	command: TrackCommand;
};
export type BalanceWorkerTrackResponse = { decision: TrackDecision };
