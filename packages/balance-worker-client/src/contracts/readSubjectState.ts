import type {
	Catalog,
	ReadSubjectStateCommand,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionRoute } from "./worker.js";

export type BalanceWorkerReadSubjectStateRequest = {
	route: PartitionRoute;
	command: ReadSubjectStateCommand;
};

/** The subject as the next command would see it, and the catalog rows its rows reference. */
export type ReadSubjectStateReply = {
	state: SubjectState;
	catalog: Catalog;
};
