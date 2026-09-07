import type { CheckCommand, CheckDecision } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerCheckRequest = {
	route: PartitionRoute;
	command: CheckCommand;
};
export type BalanceWorkerCheckResponse = { decision: CheckDecision };
