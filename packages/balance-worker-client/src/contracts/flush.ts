import type { FlushCommand } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerFlushRequest = {
	route: PartitionRoute;
	command: FlushCommand;
};
export type FlushReply = { stored: true };
