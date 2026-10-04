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
/** What the check decided and the rows it decided against. */
export type CheckReply = {
	result: CheckResult;
	state: SubjectState;
	/** The catalog rows the command was decided against, so the server builds its response without loading them. */
	catalog: Catalog;
	/** Until when a server may answer the same check from this reply; null when the answer could change sooner. Absent from older workers. */
	lease?: CheckLease | null;
};

/** On the deciding check's clock: a server answers repeats from the reply until then, and never past its own one-second cap. */
export type CheckLease = { expiresAt: number };
