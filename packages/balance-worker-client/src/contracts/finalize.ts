import type {
	Catalog,
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
export type FinalizeReply = {
	result: FinalizeResult;
	changes: RowChange[];
	state: SubjectState;
	catalog: Catalog;
};
