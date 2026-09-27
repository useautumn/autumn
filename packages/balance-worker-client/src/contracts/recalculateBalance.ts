import type {
	RecalculateBalanceCommand,
	RecalculateBalanceResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerRecalculateBalanceRequest = {
	route: PartitionRoute;
	command: RecalculateBalanceCommand;
};
export type RecalculateBalanceReply = { result: RecalculateBalanceResult };
