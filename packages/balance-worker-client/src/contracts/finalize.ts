import type { FinalizeCommand, FinalizeResult } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerFinalizeRequest = {
	route: PartitionRoute;
	command: FinalizeCommand;
};
/** What the finalize decided, and nothing of the customer's rows: those grow with its open locks, past a reply's size. */
export type FinalizeReply = {
	result: FinalizeResult;
};
