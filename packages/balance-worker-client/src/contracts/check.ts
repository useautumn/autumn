import type {
	Catalog,
	CheckCommand,
	CheckResult,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerCheckRequest = {
	route: PartitionRoute;
	command: CheckCommand;
};
export type CheckReply = {
	result: CheckResult;
	state: SubjectState;
	catalog: Catalog;
};
