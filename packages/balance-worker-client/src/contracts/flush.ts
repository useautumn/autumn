import type { FlushCommand } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerFlushRequest = {
	route: PartitionRoute;
	command: FlushCommand;
};
/** Postgres holds every write the owner had accepted for the customer when the command arrived. */
export type FlushReply = { stored: true };
