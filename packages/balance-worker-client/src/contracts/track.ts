import type {
	Catalog,
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

/** The committed mutation's two halves, verbatim, and the subject's rows once it is committed. */
export type TrackReply = {
	result: TrackResult;
	changes: RowChange[];
	state: SubjectState;
	/** The catalog rows the command was decided against, so the server builds its response without loading them. */
	catalog: Catalog;
};
