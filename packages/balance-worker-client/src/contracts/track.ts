import type {
	Catalog,
	MutationEffect,
	RowChange,
	SubjectState,
	TrackCommand,
	TrackResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerTrackRequest = {
	route: PartitionRoute;
	command: TrackCommand;
};

export type TrackReply = {
	result: TrackResult;
	changes: RowChange[];
	state: SubjectState;
	catalog: Catalog;
	effects?: MutationEffect[];
};
