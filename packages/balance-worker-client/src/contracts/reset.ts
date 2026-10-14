import type { ResetCommand, ResetResult } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerResetRequest = {
	route: PartitionRoute;
	command: ResetCommand;
};
export type ResetReply = { result: ResetResult | null };
