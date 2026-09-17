import type {
	CheckCommand,
	CheckResult,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerCheckRequest = {
	route: PartitionRoute;
	command: CheckCommand;
};
/** What the check decided and the rows it decided against. */
export type CheckReply = {
	result: CheckResult;
	state: SubjectState;
};
