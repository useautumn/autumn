import type {
	FinalizeCommand,
	FinalizeResult,
	RowChange,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerFinalizeRequest = {
	route: PartitionRoute;
	command: FinalizeCommand;
};
/** What the finalize decided, the row changes that carry it, and the customer's rows afterwards. */
export type FinalizeReply = {
	result: FinalizeResult;
	changes: RowChange[];
	state: SubjectState;
};
