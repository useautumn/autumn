import type {
	UpdateBalanceCommand,
	UpdateBalanceResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerUpdateBalanceRequest = {
	route: PartitionRoute;
	command: UpdateBalanceCommand;
};
export type UpdateBalanceReply = { result: UpdateBalanceResult | null };
