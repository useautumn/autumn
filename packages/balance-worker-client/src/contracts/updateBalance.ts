import type {
	UpdateBalanceCommand,
	UpdateBalanceResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerUpdateBalanceRequest = {
	route: PartitionRoute;
	command: UpdateBalanceCommand;
};
/** Null when the rows already held what was asked, so nothing was written. */
export type UpdateBalanceReply = { result: UpdateBalanceResult | null };
