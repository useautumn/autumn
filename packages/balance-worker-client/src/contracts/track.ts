import type {
	SubjectState,
	TrackCommand,
	TrackResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerTrackRequest = {
	route: PartitionRoute;
	command: TrackCommand;
};

/** The logged result, and the subject's rows once it is committed. */
export type TrackReply = {
	result: TrackResult;
	state: SubjectState;
};
