import type { EvictCommand } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerEvictRequest = {
	route: PartitionRoute;
	command: EvictCommand;
};
export type EvictReply = { evicted: boolean };
