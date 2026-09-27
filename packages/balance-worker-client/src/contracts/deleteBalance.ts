import type {
	DeleteBalanceCommand,
	DeleteBalanceResult,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerDeleteBalanceRequest = {
	route: PartitionRoute;
	command: DeleteBalanceCommand;
};
export type DeleteBalanceReply = { result: DeleteBalanceResult };
