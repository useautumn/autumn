import type { EvictCommand } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerEvictRequest = {
	route: PartitionRoute;
	command: EvictCommand;
};
/** Whether the owner held rows for the customer when the command arrived. */
export type EvictReply = { evicted: boolean };
