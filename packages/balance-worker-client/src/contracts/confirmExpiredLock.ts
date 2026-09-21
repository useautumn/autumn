import type {
	ConfirmExpiredLockCommand,
	ConfirmExpiredLockResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerConfirmExpiredLockRequest = {
	route: PartitionRoute;
	command: ConfirmExpiredLockCommand;
};
export type ConfirmExpiredLockReply = { result: ConfirmExpiredLockResult };
