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

export type ReadSubjectStateReply = {
	state: SubjectState;
	catalog: Catalog;
	logOffset?: string;
};
