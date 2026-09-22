import type { ResetCommand, ResetResult } from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerResetRequest = {
	route: PartitionRoute;
	command: ResetCommand;
};
/** Null when nothing was due at the command's clock, so nothing was written. */
export type ResetReply = { result: ResetResult | null };
