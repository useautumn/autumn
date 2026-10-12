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
	/** Every record of the partition at or below it is in `state`; later decisions may be too. Decimal; absent from an older worker. */
	logOffset?: string;
};
