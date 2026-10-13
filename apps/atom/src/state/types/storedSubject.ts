import type {
	Catalog,
	MeteringIdentity,
	SubjectState,
} from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";

/** One subject as Autumn last sent it: the engine's rows, the catalog rows they reference, and the org settings a check reads. */
export type StoredSubject = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	/** The balance-log offset the subject was read after. */
	logOffset: bigint;
	/** When Autumn read the subject from its worker, in epoch ms. */
	readAt: number;
	/** On the customer's own part, the log offset of its latest evict: an entity part read from before it may be stale. 0n on an entity's part. */
	customerVersion: bigint;
};

/** A customer or entity Autumn deleted: its identity at a version, so no copy read before the delete outranks it. */
export type DeletedSubject = Pick<
	StoredSubject,
	"logOffset" | "readAt" | "customerVersion"
> & {
	state: { identity: MeteringIdentity; deleted: true };
	catalog: null;
	org: null;
};

/** What a subject's row holds: the subject Autumn last sent, or its deletion. */
export type SubjectRow = StoredSubject | DeletedSubject;

export const isDeletedSubject = (row: SubjectRow): row is DeletedSubject =>
	"deleted" in row.state;
