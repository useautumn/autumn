import type {
	InitializationDecision,
	InitializeCommand,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerInitializeRequest = {
	route: PartitionRoute;
	command: InitializeCommand;
};
export type BalanceWorkerInitializeResponse = {
	decision: InitializationDecision;
};
